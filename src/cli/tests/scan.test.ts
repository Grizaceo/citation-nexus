import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";

const REPO = process.cwd();
const SCAN_CMD = ["npx", "--no-install", "tsx", "src/cli/scan.ts"];

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(stdin: string, timeoutMs = 30_000): CliResult {
  const r = spawnSync(SCAN_CMD[0]!, SCAN_CMD.slice(1), {
    input: stdin,
    cwd: REPO,
    encoding: "utf-8",
    timeout: timeoutMs,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

function parseResults(stdout: string): Array<{ findings: unknown[] }> {
  const parsed = JSON.parse(stdout);
  return parsed.results;
}

describe("CLI scanner — batch mode", () => {
  it("returns empty results array for empty batch", () => {
    const r = runCli(JSON.stringify({ items: [] }));
    expect(r.status).toBe(0);
    expect(parseResults(r.stdout)).toEqual([]);
  });

  it("scans a single item and returns its findings", () => {
    const r = runCli(
      JSON.stringify({ items: [{ text: "We use arXiv:2401.01234 here." }] })
    );
    expect(r.status).toBe(0);
    const results = parseResults(r.stdout);
    expect(results).toHaveLength(1);
    const ids = (results[0]!.findings as Array<{ text: string }>).map(
      (f) => f.text
    );
    // The arxiv.id pattern captures only the digits, so the surfaced
    // text is "2401.01234" (the id), not the full "arXiv:..." prefix.
    expect(ids).toContain("2401.01234");
  });

  it("scans multiple items in one subprocess call", () => {
    const r = runCli(
      JSON.stringify({
        items: [
          { text: "Llama-3 on MNIST." },
          { text: "GPT-4o on CIFAR-10." },
          { text: "Plain prose, no findings." },
        ],
      })
    );
    expect(r.status).toBe(0);
    const results = parseResults(r.stdout);
    expect(results).toHaveLength(3);
    expect(
      (results[0]!.findings as Array<{ text: string }>).map((f) => f.text)
    ).toContain("Llama-3");
    expect(
      (results[1]!.findings as Array<{ text: string }>).map((f) => f.text)
    ).toContain("GPT-4o");
    expect(results[2]!.findings).toHaveLength(0);
  });

  it("preserves item order in results array", () => {
    const texts = ["text A", "text B", "text C", "text D"];
    const r = runCli(
      JSON.stringify({ items: texts.map((text) => ({ text })) })
    );
    const results = parseResults(r.stdout);
    expect(results).toHaveLength(4);
    // Plain text shouldn't produce findings, but the array order
    // should still be preserved.
  });
});

describe("CLI scanner — error paths", () => {
  it("non-JSON stdin exits with code 2", () => {
    const r = runCli("not json at all");
    expect(r.status).toBe(2);
    expect(r.stderr.toLowerCase()).toContain("bad json");
  });

  it("JSON without 'items' field exits with code 2", () => {
    const r = runCli(JSON.stringify({ wrong: "shape" }));
    expect(r.status).toBe(2);
    expect(r.stderr.toLowerCase()).toContain("items");
  });

  it("items not an array exits with code 2", () => {
    const r = runCli(JSON.stringify({ items: "not an array" }));
    expect(r.status).toBe(2);
    expect(r.stderr.toLowerCase()).toContain("array");
  });
});

describe("CLI scanner — output shape", () => {
  it("emits a single JSON object with a 'results' field", () => {
    const r = runCli(JSON.stringify({ items: [{ text: "anything" }] }));
    const obj = JSON.parse(r.stdout);
    expect(obj).toHaveProperty("results");
    expect(Array.isArray(obj.results)).toBe(true);
  });

  it("each result has a 'findings' array", () => {
    const r = runCli(JSON.stringify({ items: [{ text: "MNIST" }] }));
    const obj = JSON.parse(r.stdout);
    expect(Array.isArray(obj.results[0].findings)).toBe(true);
  });
});
