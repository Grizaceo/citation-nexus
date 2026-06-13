import { describe, it, expect } from "vitest";
import { scienceSet } from "../sets/science";
import { PatternRegistry, applyPatterns } from "../registry";

function reg(): PatternRegistry {
  const r = new PatternRegistry();
  r.register(scienceSet);
  return r;
}

function findingsOf(category: string, text: string): string[] {
  document.body.innerHTML = `<div id="t">${text.replace(/\n/g, "<br>")}</div>`;
  const root = document.getElementById("t")!;
  const all = applyPatterns(root, reg());
  return all.filter((f) => f.category === category).map((f) => f.text);
}

describe("science — math", () => {
  it("detects Theorem 1.2", () => {
    expect(findingsOf("math", "By Theorem 1.2 we conclude X.")).toContain("1.2");
  });
  it("detects Definition 3.1", () => {
    expect(findingsOf("math", "Use Definition 3.1 to define f.")).toContain(
      "3.1"
    );
  });
  it("detects Big-O", () => {
    expect(findingsOf("math", "The runtime is O(n log n).").some((s) => s.startsWith("O("))).toBe(
      true
    );
  });
  it("detects eq-prefixed equation reference", () => {
    expect(findingsOf("math", "We use (eq. 1) and (eq. 2).")).toContain("2");
  });
  // Regression: dogfooding on PubMed (2026-06-13) found 6 false
  // positives on a single results page, all from the
  // volume(issue) format "159(2):201-209" in journal citations.
  // The falsifier `before: /\d$/` drops those; real equation
  // references are preceded by whitespace or punctuation.
  it("drops (N) when preceded by a digit (volume/issue FP)", () => {
    // PubMed-style journal citation: the (2) is the issue number
    // inside the volume, not a math equation.
    const text = "JAMA Dermatol. 2023;159(2):201-209.";
    expect(findingsOf("math", text)).not.toContain("2");
  });
  it("keeps (N) when preceded by whitespace (real equation ref)", () => {
    const text = "By Theorem 1 we have f(x) = (1) for all x.";
    expect(findingsOf("math", text)).toContain("1");
  });
  it("keeps (N) when preceded by punctuation (Eq. (1))", () => {
    const text = "From Eq. (3) the result follows immediately.";
    expect(findingsOf("math", text)).toContain("3");
  });
});

describe("science — physics", () => {
  it("detects particle names", () => {
    const got = findingsOf("physics", "The muon decays into an electron and two neutrinos.");
    expect(got).toContain("muon");
    expect(got).toContain("electron");
  });
  it("detects detectors", () => {
    const got = findingsOf("physics", "ATLAS and CMS observed a Z boson at the LHC.");
    expect(got).toContain("Z boson");
  });
  it("detects physical units", () => {
    const got = findingsOf("physics", "The beam has energy 13.6 GeV and mass 938 MeV.");
    expect(got.some((s) => s.includes("GeV"))).toBe(true);
  });
});

describe("science — biology", () => {
  it("detects gene symbol", () => {
    const got = findingsOf("biology", "Mutations in TP53 are common in tumors.");
    expect(got).toContain("TP53");
  });
  it("detects protein family", () => {
    const got = findingsOf("biology", "p53 and Ras are central to cancer biology.");
    expect(got).toContain("p53");
  });
  it("detects wet-lab technique", () => {
    const got = findingsOf("biology", "We performed ChIP-seq and qPCR validation.");
    expect(got).toContain("ChIP-seq");
  });
});

describe("science — cs", () => {
  it("detects CS conference", () => {
    const got = findingsOf("cs", "Published at NeurIPS 2024.");
    expect(got.some((s) => s.startsWith("NeurIPS"))).toBe(true);
  });
  it("detects ML model", () => {
    const got = findingsOf("cs", "We fine-tuned Llama-3 and GPT-4o on the same corpus.");
    expect(got).toContain("Llama-3");
    expect(got).toContain("GPT-4o");
  });
  it("detects dataset", () => {
    const got = findingsOf("cs", "Trained on MNIST and CIFAR-10.");
    expect(got).toContain("MNIST");
  });
});

describe("science — chemistry", () => {
  it("detects common formula", () => {
    const got = findingsOf("chemistry", "Water (H2O) and carbon dioxide (CO2) are abundant.");
    expect(got).toContain("H2O");
    expect(got).toContain("CO2");
  });
});
