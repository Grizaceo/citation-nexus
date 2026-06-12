import { describe, it, expect } from "vitest";
import { getDownloadUrl, getDownloadLabel } from "@/lib/download";
import type { Finding } from "@/patterns/core";

function mkFinding(patternId: string, text: string): Finding {
  return {
    patternId,
    category: "citation",
    label: patternId,
    text,
    start: 0,
    end: text.length,
    node: {} as Text,
    source: "text",
  };
}

describe("getDownloadUrl", () => {
  it("arxiv.id -> arxiv.org/pdf/<id>", () => {
    expect(getDownloadUrl(mkFinding("arxiv.id", "2605.22166"))).toBe(
      "https://arxiv.org/pdf/2605.22166"
    );
  });

  it("arxiv.abs (captured ID) -> arxiv.org/pdf/<id>", () => {
    // arxiv.abs regex captures the bare ID, not the full URL.
    expect(getDownloadUrl(mkFinding("arxiv.abs", "2605.22166v1"))).toBe(
      "https://arxiv.org/pdf/2605.22166v1"
    );
  });

  it("doi -> doi.org/<doi>", () => {
    expect(getDownloadUrl(mkFinding("doi", "10.1038/nature12373"))).toBe(
      "https://doi.org/10.1038/nature12373"
    );
  });

  it("doi.url (captured DOI) -> doi.org/<doi>", () => {
    expect(getDownloadUrl(mkFinding("doi.url", "10.1038/nature12373"))).toBe(
      "https://doi.org/10.1038/nature12373"
    );
  });

  it("returns null for pmid (no direct PDF)", () => {
    expect(getDownloadUrl(mkFinding("pmid", "33445566"))).toBe(null);
  });

  it("returns null for pmcid", () => {
    expect(getDownloadUrl(mkFinding("pmcid", "PMC123456"))).toBe(null);
  });

  it("returns null for github (would need owner/repo parsing)", () => {
    expect(getDownloadUrl(mkFinding("github", "facebook/react"))).toBe(null);
  });

  it("returns null for biorxiv / medrxiv (need full DOI)", () => {
    expect(getDownloadUrl(mkFinding("biorxiv", "10.1101/2021.01.01.123456"))).toBe(null);
    expect(getDownloadUrl(mkFinding("medrxiv", "10.1101/2021.01.01.123456"))).toBe(null);
  });

  it("returns null for unknown / science patterns", () => {
    expect(getDownloadUrl(mkFinding("cs.model", "Llama-3"))).toBe(null);
    expect(getDownloadUrl(mkFinding("math.theorem", "Theorem 1.2"))).toBe(null);
  });
});

describe("getDownloadLabel", () => {
  it("labels arxiv patterns", () => {
    expect(getDownloadLabel(mkFinding("arxiv.id", "x"))).toBe("Open PDF on arXiv");
    expect(getDownloadLabel(mkFinding("arxiv.abs", "x"))).toBe("Open PDF on arXiv");
  });
  it("labels doi patterns", () => {
    expect(getDownloadLabel(mkFinding("doi", "x"))).toBe("Resolve on doi.org");
    expect(getDownloadLabel(mkFinding("doi.url", "x"))).toBe("Resolve on doi.org");
  });
  it("returns null for unsupported patterns", () => {
    expect(getDownloadLabel(mkFinding("pmid", "x"))).toBe(null);
    expect(getDownloadLabel(mkFinding("github", "x"))).toBe(null);
  });
});
