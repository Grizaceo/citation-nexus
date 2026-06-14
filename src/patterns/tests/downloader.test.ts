import { describe, it, expect } from "vitest";
import {
  getDownloadInfo,
  planBatch,
} from "@/patterns/downloader";
import type { Finding } from "@/patterns/core";

function mkFinding(overrides: Partial<Finding>): Finding {
  return {
    patternId: "arxiv.id",
    category: "citation",
    label: "arXiv",
    text: "2401.01234",
    start: 0,
    end: 10,
    node: {} as Text,
    source: "meta",
    confidence: 1.0,
    ...overrides,
  };
}

describe("getDownloadInfo — gating", () => {
  it("returns null for text-body matches (source === 'text')", () => {
    const f = mkFinding({ source: "text", confidence: 0.7 });
    expect(getDownloadInfo(f)).toBe(null);
  });

  it("returns null for low-confidence matches (canonical=0.9 survives, body=0.7 rejected)", () => {
    const f = mkFinding({ source: "text", confidence: 0.84 });
    // source === "text" trumps confidence — the gate runs first.
    expect(getDownloadInfo(f)).toBe(null);
  });

  it("returns null when confidence is below 0.85 but source is not 'text'", () => {
    // E.g. some future source with confidence 0.8. We still
    // gate on 0.85 to keep the rule simple.
    const f = mkFinding({
      source: "canonical",
      confidence: 0.8,
    });
    expect(getDownloadInfo(f)).toBe(null);
  });

  it("accepts meta-tag (confidence 1.0)", () => {
    const f = mkFinding({ source: "meta", confidence: 1.0 });
    expect(getDownloadInfo(f)).not.toBe(null);
  });

  it("accepts JSON-LD (confidence 0.95)", () => {
    const f = mkFinding({ source: "json-ld", confidence: 0.95 });
    expect(getDownloadInfo(f)).not.toBe(null);
  });

  it("accepts canonical link (confidence 0.9)", () => {
    const f = mkFinding({ source: "canonical", confidence: 0.9 });
    expect(getDownloadInfo(f)).not.toBe(null);
  });
});

describe("getDownloadInfo — arXiv", () => {
  it("arxiv.id bare ID -> arxiv.org/pdf/<id>.pdf", () => {
    const f = mkFinding({
      patternId: "arxiv.id",
      text: "2401.01234",
    });
    const info = getDownloadInfo(f);
    expect(info).toEqual({
      url: "https://arxiv.org/pdf/2401.01234",
      category: "citation",
      filename: "2401.01234",
      format: "pdf",
    });
  });

  it("arxiv.id with version suffix -> arxiv.org/pdf/<id>v<N>.pdf", () => {
    const f = mkFinding({
      patternId: "arxiv.id",
      text: "2401.01234v2",
    });
    const info = getDownloadInfo(f);
    expect(info?.url).toBe("https://arxiv.org/pdf/2401.01234v2");
    expect(info?.filename).toBe("2401.01234v2");
  });

  it("arxiv.abs (also returns bare ID) -> same URL", () => {
    const f = mkFinding({
      patternId: "arxiv.abs",
      text: "2605.22166",
    });
    const info = getDownloadInfo(f);
    expect(info?.url).toBe("https://arxiv.org/pdf/2605.22166");
  });

  it("rejects malformed arXiv IDs", () => {
    const f = mkFinding({ text: "not-an-id" });
    expect(getDownloadInfo(f)).toBe(null);
  });
});

describe("getDownloadInfo — DOI", () => {
  it("doi -> doi.org/<doi> (follows redirect)", () => {
    const f = mkFinding({
      patternId: "doi",
      text: "10.1038/nature12373",
    });
    const info = getDownloadInfo(f);
    expect(info?.url).toBe("https://doi.org/10.1038/nature12373");
    // Slash in DOI becomes underscore for filesystem safety.
    expect(info?.filename).toBe("10.1038_nature12373");
    expect(info?.format).toBe("html");
  });

  it("doi.url with full URL also yields the bare DOI", () => {
    const f = mkFinding({
      patternId: "doi.url",
      text: "10.1234/example",
    });
    const info = getDownloadInfo(f);
    expect(info?.url).toBe("https://doi.org/10.1234/example");
  });

  it("rejects DOI with control characters", () => {
    const f = mkFinding({ text: "10.1234/\x00bad" });
    expect(getDownloadInfo(f)).toBe(null);
  });
});

describe("getDownloadInfo — unsupported patterns", () => {
  it("returns null for pmid when confidence is below 0.85 (text body)", () => {
    // PMID on a PubMed page comes from a citation_pmid meta tag
    // (high confidence) and now gets a [Save] via Europe PMC.
    // A text-body PMID match is still below 0.85 and gets gated
    // out. This test guards the gate, not the URL.
    const f = mkFinding({ patternId: "pmid", text: "12345", source: "text", confidence: 0.7 });
    expect(getDownloadInfo(f)).toBe(null);
  });

  it("pmid high-confidence -> europepmc.org/article/MED/{PMID} (best-effort fallback)", () => {
    // When the PubMed page has a citation_pmid meta tag but no
    // citation_pdf_url, the user still gets a [Save] button.
    // The fetch target is the Europe PMC article landing page
    // (canonical open mirror for PubMed). The fetcher saves the
    // HTML; the user clicks through to find the PDF on Europe
    // PMC's UI. Not a direct PDF — the honest alternative would
    // be an API hop (europepmc.org API to look up the PMCID then
    // construct the PMC PDF URL), deferred to v2.
    const f = mkFinding({ patternId: "pmid", text: "38217568", source: "meta", confidence: 1.0 });
    const info = getDownloadInfo(f);
    expect(info).not.toBe(null);
    expect(info!.url).toBe("https://europepmc.org/article/MED/38217568");
    expect(info!.format).toBe("html");
    expect(info!.filename).toBe("pmid-38217568");
  });

  it("pmid with malformed (non-numeric) text returns null", () => {
    const f = mkFinding({ patternId: "pmid", text: "PMID: 12345", source: "meta", confidence: 1.0 });
    expect(getDownloadInfo(f)).toBe(null);
  });

  it("returns null for pmcid", () => {
    const f = mkFinding({ patternId: "pmcid", text: "PMC123456" });
    expect(getDownloadInfo(f)).toBe(null);
  });

  it("returns null for github (clone URL parsing needed)", () => {
    const f = mkFinding({ patternId: "github", text: "facebook/react" });
    expect(getDownloadInfo(f)).toBe(null);
  });

  it("returns null for biorxiv/medrxiv patterns when source is text body", () => {
    // The biorxiv/medrxiv PATTERN itself (matching DOIs that
    // include the biorxiv/medrxiv slug) is reachable via the
    // downloader now (with the .full.pdf URL). But the source
    // gate still wins: a text-body match is below 0.85 confidence
    // and is rejected. This test guards the gate, not the URL.
    const f = mkFinding({
      patternId: "biorxiv",
      text: "10.1101/2021.01.01.123456",
      source: "text",
      confidence: 0.7,
    });
    expect(getDownloadInfo(f)).toBe(null);
  });

  it("biorxiv high-confidence -> biorxiv.org/content/{DOI}.full.pdf", () => {
    const f = mkFinding({
      patternId: "biorxiv",
      text: "10.1101/2021.01.01.123456",
      source: "meta",
      confidence: 1.0,
    });
    const info = getDownloadInfo(f);
    expect(info).not.toBe(null);
    expect(info!.url).toBe(
      "https://www.biorxiv.org/content/10.1101/2021.01.01.123456.full.pdf"
    );
    expect(info!.format).toBe("pdf");
  });

  it("medrxiv high-confidence -> medrxiv.org/content/{DOI}.full.pdf", () => {
    const f = mkFinding({
      patternId: "medrxiv",
      text: "10.1101/2021.01.02.654321",
      source: "meta",
      confidence: 1.0,
    });
    const info = getDownloadInfo(f);
    expect(info).not.toBe(null);
    expect(info!.url).toBe(
      "https://www.medrxiv.org/content/10.1101/2021.01.02.654321.full.pdf"
    );
  });

  it("citation_pdf_url -> use the URL as-is (PMC case)", () => {
    const url =
      "https://pmc.ncbi.nlm.nih.gov/articles/PMC10984893/pdf/13613_2024_Article_1277.pdf";
    const f = mkFinding({
      patternId: "pdf_url",
      text: url,
      source: "meta",
      confidence: 1.0,
    });
    const info = getDownloadInfo(f);
    expect(info).not.toBe(null);
    expect(info!.url).toBe(url);
    expect(info!.format).toBe("pdf");
    expect(info!.filename).toBe("13613_2024_Article_1277");
  });

  it("pdf_url with non-http scheme is rejected", () => {
    const f = mkFinding({
      patternId: "pdf_url",
      text: "ftp://example.com/paper.pdf",
      source: "meta",
      confidence: 1.0,
    });
    expect(getDownloadInfo(f)).toBe(null);
  });

  it("returns null for science patterns (no paper to download)", () => {
    const f = mkFinding({ patternId: "cs.model", text: "Llama-3" });
    expect(getDownloadInfo(f)).toBe(null);
    const f2 = mkFinding({ patternId: "math.theorem", text: "Theorem 1.2" });
    expect(getDownloadInfo(f2)).toBe(null);
  });
});

describe("planBatch", () => {
  it("separates planned downloads from skipped findings", () => {
    const findings: Finding[] = [
      mkFinding({ patternId: "arxiv.id", text: "2401.01234", source: "meta", confidence: 1.0 }),
      mkFinding({ patternId: "arxiv.id", text: "2506.09999", source: "text", confidence: 0.7 }),
      mkFinding({ patternId: "doi", text: "10.1038/x", source: "json-ld", confidence: 0.95 }),
      mkFinding({ patternId: "pmid", text: "12345", source: "meta", confidence: 1.0 }),
    ];
    const plan = planBatch(findings);
    expect(plan.planned).toHaveLength(2);
    expect(plan.skipped).toHaveLength(2);
    expect(plan.planned.map((p) => p.finding.text).sort()).toEqual([
      "10.1038/x",
      "2401.01234",
    ]);
    expect(plan.skipped[0]!.reason).toMatch(/text-body/);
    expect(plan.skipped[1]!.reason).toMatch(/not downloadable/);
  });

  it("returns empty plans and skipped lists for empty input", () => {
    const plan = planBatch([]);
    expect(plan.planned).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });
});
