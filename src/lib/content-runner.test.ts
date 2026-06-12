import { describe, it, expect, vi, beforeEach } from "vitest";
import { runScanCycle, type ScanMessage } from "@/lib/content-runner";
import { getDefaultRegistry } from "@/patterns/registry";

const registry = getDefaultRegistry();

function mount(text: string): HTMLElement {
  document.body.innerHTML = "";
  const p = document.createElement("p");
  const t = document.createTextNode(text);
  p.appendChild(t);
  document.body.appendChild(p);
  return p;
}

describe("runScanCycle", () => {
  it("renders highlights into the DOM and emits CITATIONS_UPDATE", () => {
    const p = mount("We trained a Transformer on MNIST.");
    const sent: ScanMessage[] = [];
    const n = runScanCycle(
      p,
      registry,
      { url: "https://example.com", title: "T" },
      (msg) => sent.push(msg)
    );
    expect(n).toBeGreaterThan(0);
    expect(p.querySelectorAll("mark.nx-sentence").length).toBe(1);
    expect(p.querySelectorAll("span.nx-highlight").length).toBeGreaterThanOrEqual(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe("CITATIONS_UPDATE");
    expect(sent[0]!.payload.url).toBe("https://example.com");
    expect(sent[0]!.payload.title).toBe("T");
  });

  it("returns 0 and emits no findings on plain prose", () => {
    const p = mount("Just plain prose without any matches.");
    const sent: ScanMessage[] = [];
    const n = runScanCycle(
      p,
      registry,
      { url: "u", title: "t" },
      (msg) => sent.push(msg)
    );
    expect(n).toBe(0);
    expect(p.querySelectorAll("mark.nx-sentence, span.nx-highlight").length).toBe(0);
    // Even with no findings, the message is still sent (so the popup
    // can show a 0 count rather than stale data from a previous tab).
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload.findings).toHaveLength(0);
  });

  it("captures the live URL and title from the page object", () => {
    const p = mount("Plain text.");
    const sent: ScanMessage[] = [];
    runScanCycle(
      p,
      registry,
      { url: "https://arxiv.org/abs/2401.01234", title: "Paper" },
      (msg) => sent.push(msg)
    );
    expect(sent[0]!.payload.url).toBe("https://arxiv.org/abs/2401.01234");
  });

  it("finding entries carry the fields the popup needs", () => {
    const p = mount("Llama-3 outperforms GPT-4o on MNIST.");
    const sent: ScanMessage[] = [];
    runScanCycle(
      p,
      registry,
      { url: "u", title: "t" },
      (msg) => sent.push(msg)
    );
    const f = sent[0]!.payload.findings;
    for (const finding of f) {
      expect(finding).toHaveProperty("patternId");
      expect(finding).toHaveProperty("category");
      expect(finding).toHaveProperty("text");
      expect(finding).toHaveProperty("start");
      expect(finding).toHaveProperty("end");
    }
  });
});
