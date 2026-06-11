# Citation Nexus — Goldset

Hand-curated evaluation set for the pattern registry. Each line of
`data/*.jsonl` is a single example; the eval script (`scripts/eval_goldset.py`)
runs the TS registry over every example, scores TP/FP/FN per pattern, and
emits a markdown report.

## Conventions

- One JSON object per line.
- Required fields:
  - `pattern` — the pattern id (`arxiv.id`, `math.theorem`, …) that this
    example targets. The same id may appear across many examples.
  - `text` — the input string. Will be HTML-escaped before scanning.
- One of:
  - `expect` — the string the pattern is expected to surface (positive).
  - `expect_null` — boolean true to assert the pattern does **not** fire
    (negative). Keeping it a flag (not just `expect: null`) makes the
    intent obvious in the file.

Positive examples should cover:
- Plain isolated hits ("arXiv:2401.01234 alone in a sentence").
- Hits embedded in realistic prose.
- Edge cases (with punctuation, parentheses, line breaks).

Negative examples should cover:
- Common false positives (lookalikes that shouldn't match).
- Partial overlaps the pattern must reject.
- Cross-category collisions ("CO2" must be chemistry, not biology).

## Format

```json
{"pattern": "arxiv.id", "text": "We use arXiv:2401.01234 in our work.", "expect": "2401.01234"}
{"pattern": "arxiv.id", "text": "In 2019 the conference took place in Boston.", "expect_null": true}
```

## Running

```bash
# from repo root
python goldset/scripts/eval_goldset.py
```

Output:
- Per-pattern P/R/F1 table → stdout
- `goldset/reports/latest.md` (overwritten each run)
- Exit code 0 if macro F1 ≥ `THRESHOLD` (default 0.85), else 1

## Adding a pattern

1. Add a `PatternDef` to `src/patterns/sets/<set>.ts`.
2. Mirror the id in `bridge/nexus_bridge/server.py` → `PATTERN_SETS`.
3. Add at least 5 positive + 5 negative examples to the relevant jsonl.
4. Run `python goldset/scripts/eval_goldset.py` and confirm F1 ≥ threshold.
5. Commit. CI will fail if a new pattern drops macro F1.

## Why not just use the vitest unit tests?

Vitest tests are *specs*: they assert "this pattern, on this fixed input,
returns X." The goldset is a *benchmark*: it scores "this pattern, across
many realistic inputs, achieves P/R/F1." A unit test passes when the code
matches the author's intent; a goldset fails when the code matches the
author's intent *but the author's intent is wrong*.
