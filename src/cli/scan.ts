// Citation Nexus — CLI scanner (batch)
// Reads JSON `{"items": [{"text": "..."}, ...]}` on stdin, applies the
// default registry to each item, and writes
// `{"results": [{"findings": [...]}, ...]}` on stdout.
// Used by goldset/scripts/eval_goldset.py to score the registry in a
// single subprocess instead of N spawns.

import { applyPatternsToText, getDefaultRegistry } from "../patterns/registry";

interface Input {
  items: Array<{ text: string }>;
}

interface FindingOut {
  patternId: string;
  category: string;
  text: string;
  start: number;
  end: number;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (buf += chunk));
    process.stdin.on("end", () => resolve(buf));
  });
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let input: Input;
  try {
    input = JSON.parse(raw) as Input;
  } catch (e) {
    process.stderr.write(`bad json on stdin: ${String(e)}\n`);
    process.exit(2);
  }
  if (!Array.isArray(input.items)) {
    process.stderr.write(`input.items must be an array\n`);
    process.exit(2);
  }

  const registry = getDefaultRegistry();
  const results: Array<{ findings: FindingOut[] }> = [];
  for (const item of input.items) {
    if (typeof item.text !== "string") {
      results.push({ findings: [] });
      continue;
    }
    const findings = applyPatternsToText(item.text, registry);
    results.push({
      findings: findings.map((f) => ({
        patternId: f.patternId,
        category: f.category,
        text: f.text,
        start: f.start,
        end: f.end,
      })),
    });
  }
  process.stdout.write(JSON.stringify({ results }));
}

main().catch((e) => {
  process.stderr.write(`fatal: ${String(e)}\n`);
  process.exit(1);
});
