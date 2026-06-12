import { describe, it, expect, beforeEach } from "vitest";
import { renderHighlights } from "../highlight";
import { applyPatterns, getDefaultRegistry } from "../registry";

// renderHighlights operates on a happy-dom document; we mount a single
// text node and run the DOM walker (applyPatterns), which returns
// Finding[] with a node reference, then pass that to renderHighlights.

const registry = getDefaultRegistry();

function renderIn(text: string): HTMLElement {
  document.body.innerHTML = "";
  const p = document.createElement("p");
  const t = document.createTextNode(text);
  p.appendChild(t);
  document.body.appendChild(p);
  const findings = applyPatterns(p, registry);
  renderHighlights(findings);
  return p;
}

describe("renderHighlights — sentence wrapping", () => {
  it("wraps a sentence with at least one match in <mark class='nx-sentence'>", () => {
    const root = renderIn("We trained a Transformer. Nothing relevant here.");
    const marks = root.querySelectorAll("mark.nx-sentence");
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toContain("Transformer");
  });

  it("does NOT wrap sentences without matches", () => {
    const root = renderIn("Just plain prose. The next sentence has nothing. arXiv:2401.01234 inside.");
    const marks = root.querySelectorAll("mark.nx-sentence");
    // Only the third sentence has a match
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toContain("arXiv:2401.01234 inside.");
  });

  it("places keyword <span> inside the sentence <mark>", () => {
    const root = renderIn("We trained a Transformer on MNIST.");
    const sentence = root.querySelector("mark.nx-sentence")!;
    const keyword = sentence.querySelector("span.nx-highlight")!;
    expect(keyword).not.toBeNull();
    expect(keyword.classList.contains("nx-highlight-cs")).toBe(true);
    expect(keyword.textContent).toBe("Transformer");
  });

  it("handles two matches in one sentence (one <mark>, two <span>s)", () => {
    const root = renderIn("We trained a Transformer on MNIST and CIFAR-10.");
    const marks = root.querySelectorAll("mark.nx-sentence");
    expect(marks).toHaveLength(1);
    const keywords = marks[0]!.querySelectorAll("span.nx-highlight");
    expect(keywords).toHaveLength(3); // Transformer, MNIST, CIFAR-10
  });
});

describe("renderHighlights — idempotency", () => {
  it("calling twice does not double-wrap", () => {
    const p = renderIn("We trained a Transformer on MNIST.");
    const marksBefore = p.querySelectorAll("mark.nx-sentence").length;
    const spansBefore = p.querySelectorAll("span.nx-highlight").length;
    // Try to render a second time on the (now mutated) DOM. The walker
    // rejects nodes inside nx-highlight / nx-sentence, so the count
    // must not change.
    renderHighlights(applyPatterns(p, registry));
    const marksAfter = p.querySelectorAll("mark.nx-sentence").length;
    const spansAfter = p.querySelectorAll("span.nx-highlight").length;
    expect(marksAfter).toBe(marksBefore);
    expect(spansAfter).toBe(spansBefore);
  });
});

describe("renderHighlights — empty input", () => {
  it("no-op when there are no findings", () => {
    document.body.innerHTML = "";
    const p = document.createElement("p");
    p.textContent = "Just some prose without any matches.";
    document.body.appendChild(p);
    const findings = applyPatterns(p, registry);
    expect(findings).toHaveLength(0);
    renderHighlights(findings);
    // No nx-sentence or nx-highlight should be in the DOM
    expect(p.querySelectorAll("mark.nx-sentence").length).toBe(0);
    expect(p.querySelectorAll("span.nx-highlight").length).toBe(0);
  });
});
