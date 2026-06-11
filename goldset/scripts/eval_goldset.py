"""Citation Nexus — Goldset evaluator.

Reads `goldset/data/*.jsonl`, runs the TS registry (via a single batch
subprocess to `npx tsx src/cli/scan.ts`) on every example, and computes
P/R/F1 per pattern and macro/micro per set.

Exit code 0 if macro F1 >= THRESHOLD, else 1.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import mean

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = REPO_ROOT / "goldset" / "data"
DEFAULT_REPORT = REPO_ROOT / "goldset" / "reports" / "latest.md"
THRESHOLD = 0.85


@dataclass
class Counts:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    tn: int = 0

    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if (self.tp + self.fp) else 0.0

    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if (self.tp + self.fn) else 0.0

    def f1(self) -> float:
        p, r = self.precision(), self.recall()
        return 2 * p * r / (p + r) if (p + r) else 0.0


def scan_batch(items: list[dict]) -> list[list[dict]]:
    """Invoke the TS CLI scanner once for the whole batch."""
    proc = subprocess.run(
        ["npx", "--no-install", "tsx", "src/cli/scan.ts"],
        input=json.dumps({"items": items}),
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
        timeout=120,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"scan CLI failed (rc={proc.returncode}): {proc.stderr.strip()}"
        )
    return json.loads(proc.stdout).get("results", [])


def evaluate(jsonl_path: Path) -> tuple[dict[str, Counts], list[dict]]:
    raw_lines = [
        ln.strip()
        for ln in jsonl_path.read_text(encoding="utf-8").splitlines()
        if ln.strip() and not ln.strip().startswith("#")
    ]
    examples = [json.loads(ln) for ln in raw_lines]
    texts = [{"text": ex["text"]} for ex in examples]
    results = scan_batch(texts)

    per_pattern: dict[str, Counts] = defaultdict(Counts)
    failures: list[dict] = []
    for ex, res in zip(examples, results):
        pattern = ex["pattern"]
        expect_match = ex.get("expect")
        # Backwards-compat: `expect: null` in JSONL is a negative (no match
        # expected); `expect_null: true` works too. A literal string match
        # is always a positive.
        if expect_match is None and not ex.get("expect_null"):
            expect_null = True
        else:
            expect_null = bool(ex.get("expect_null"))
        findings = res.get("findings", [])
        matching = [f for f in findings if f["patternId"] == pattern]
        got_text = matching[0]["text"] if matching else None

        c = per_pattern[pattern]
        if expect_null:
            if matching:
                c.fp += 1
                failures.append(
                    {
                        "pattern": pattern,
                        "text": ex["text"],
                        "expected": "no match",
                        "got": got_text,
                        "kind": "fp",
                    }
                )
            else:
                c.tn += 1
        else:
            if matching and got_text == expect_match:
                c.tp += 1
            elif matching:
                c.fp += 1
                failures.append(
                    {
                        "pattern": pattern,
                        "text": ex["text"],
                        "expected": expect_match,
                        "got": got_text,
                        "kind": "fp-mismatch",
                    }
                )
            else:
                c.fn += 1
                failures.append(
                    {
                        "pattern": pattern,
                        "text": ex["text"],
                        "expected": expect_match,
                        "got": None,
                        "kind": "fn",
                    }
                )
    return per_pattern, failures


def render_metrics(per_pattern: dict[str, Counts]) -> str:
    rows = [
        "| Pattern | TP | FP | FN | TN | Precision | Recall | F1 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for pat in sorted(per_pattern):
        c = per_pattern[pat]
        rows.append(
            f"| `{pat}` | {c.tp} | {c.fp} | {c.fn} | {c.tn} | "
            f"{c.precision():.2f} | {c.recall():.2f} | {c.f1():.2f} |"
        )
    return "\n".join(rows)


def render_macro(per_pattern: dict[str, Counts]) -> str:
    if not per_pattern:
        return "_no data_"
    macro_p = mean(c.precision() for c in per_pattern.values())
    macro_r = mean(c.recall() for c in per_pattern.values())
    macro_f1 = mean(c.f1() for c in per_pattern.values())
    total_tp = sum(c.tp for c in per_pattern.values())
    total_fp = sum(c.fp for c in per_pattern.values())
    total_fn = sum(c.fn for c in per_pattern.values())
    micro_p = total_tp / (total_tp + total_fp) if (total_tp + total_fp) else 0.0
    micro_r = total_tp / (total_tp + total_fn) if (total_tp + total_fn) else 0.0
    micro_f1 = 2 * micro_p * micro_r / (micro_p + micro_r) if (micro_p + micro_r) else 0.0
    return (
        f"- Macro P/R/F1: {macro_p:.3f} / {macro_r:.3f} / **{macro_f1:.3f}**\n"
        f"- Micro P/R/F1: {micro_p:.3f} / {micro_r:.3f} / {micro_f1:.3f}\n"
        f"- Patterns evaluated: {len(per_pattern)}"
    )


def render_failures(failures: list[dict]) -> str:
    if not failures:
        return "_none_"
    by_pat: dict[str, list[dict]] = defaultdict(list)
    for f in failures:
        by_pat[f["pattern"]].append(f)
    out = []
    for pat in sorted(by_pat):
        out.append(f"### `{pat}`")
        for f in by_pat[pat][:5]:
            out.append(
                f"- **{f['kind']}**: text=`{f['text']!r}` "
                f"expected=`{f['expected']!r}` got=`{f['got']!r}`"
            )
    return "\n".join(out)


REPORT_TEMPLATE = """# Citation Nexus — Goldset Evaluation Report

Generated by `goldset/scripts/eval_goldset.py`. See
`goldset/README.md` for conventions.

## Per-pattern metrics

{metrics}

## Per-set macro

{macro}

## Failure samples (first 5 per pattern)

{failures}
"""


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    p.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    p.add_argument("--threshold", type=float, default=THRESHOLD)
    args = p.parse_args()

    jsonl_files = sorted(args.data_dir.glob("*.jsonl"))
    if not jsonl_files:
        print(f"no goldset jsonl files found in {args.data_dir}", file=sys.stderr)
        return 1

    all_metrics: dict[str, Counts] = {}
    all_failures: list[dict] = []
    for jf in jsonl_files:
        per_pat, failures = evaluate(jf)
        for k, v in per_pat.items():
            all_metrics.setdefault(k, Counts())
            all_metrics[k].tp += v.tp
            all_metrics[k].fp += v.fp
            all_metrics[k].fn += v.fn
            all_metrics[k].tn += v.tn
        all_failures.extend(failures)
        print(
            f"[{jf.name}] {len(per_pat)} patterns, {len(failures)} failures",
            file=sys.stderr,
        )

    metrics_md = render_metrics(all_metrics)
    macro_md = render_macro(all_metrics)
    failures_md = render_failures(all_failures)

    rendered = REPORT_TEMPLATE.format(
        metrics=metrics_md, macro=macro_md, failures=failures_md
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(rendered, encoding="utf-8")

    print(metrics_md)
    print()
    print(macro_md)
    if not all_metrics:
        return 1
    macro_f1 = mean(c.f1() for c in all_metrics.values())
    if macro_f1 < args.threshold:
        print(
            f"\nGATE FAILED: macro F1 {macro_f1:.3f} < {args.threshold}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
