import { describe, it, expect } from "vitest";
import { citationsSet } from "../sets/citations";
import { PatternRegistry, applyPatterns } from "../registry";

function reg(): PatternRegistry {
  const r = new PatternRegistry();
  r.register(citationsSet);
  return r;
}

function findingsIn(text: string): string[] {
  document.body.innerHTML = `<div id="t">${text.replace(/\n/g, "<br>")}</div>`;
  const root = document.getElementById("t")!;
  const findings = applyPatterns(root, reg());
  return findings.map((f) => f.text);
}

describe("citationsSet — arXiv", () => {
  it("detects arXiv prefix and id", () => {
    const got = findingsIn("We use arXiv:2401.01234 in our work.");
    expect(got.some((s) => s.includes("2401.01234"))).toBe(true);
  });

  it("detects arxiv.org/abs URL", () => {
    const got = findingsIn("See https://arxiv.org/abs/2310.06825 for details.");
    expect(got.some((s) => s.includes("2310.06825"))).toBe(true);
  });

  it("detects arxiv versioned id", () => {
    const got = findingsIn("Results from arXiv:2401.01234v2 confirm this.");
    expect(got.some((s) => s.includes("2401.01234v2"))).toBe(true);
  });
});

describe("citationsSet — DOI", () => {
  it("detects bare DOI", () => {
    const got = findingsIn("DOI: 10.1038/nature12373 was a breakthrough.");
    expect(got.some((s) => s.includes("10.1038/"))).toBe(true);
  });

  it("detects doi.org URL", () => {
    const got = findingsIn("Available at https://doi.org/10.1109/CVPR.2018.00145");
    expect(got.some((s) => s.includes("10.1109/"))).toBe(true);
  });
});

describe("citationsSet — PubMed", () => {
  it("detects PMID prefix", () => {
    const got = findingsIn("The study (PMID: 35678901) shows a link.");
    expect(got).toContain("35678901");
  });

  it("detects pubmed URL", () => {
    const got = findingsIn("See https://pubmed.ncbi.nlm.nih.gov/33445566 for evidence.");
    expect(got).toContain("33445566");
  });
});

describe("citationsSet — PMC", () => {
  it("detects PMC id", () => {
    const got = findingsIn("Full text at PMC7654321 is open access.");
    expect(got).toContain("PMC7654321");
  });
});

describe("citationsSet — GitHub", () => {
  it("detects github URL", () => {
    const got = findingsIn("Code at https://github.com/octocat/Hello-World");
    expect(got.some((s) => s.includes("github.com/octocat/Hello-World"))).toBe(true);
  });

  it("strips .git suffix", () => {
    const got = findingsIn("Clone https://github.com/owner/repo.git to inspect.");
    expect(got.some((s) => s.includes("github.com/owner/repo"))).toBe(true);
  });
});
