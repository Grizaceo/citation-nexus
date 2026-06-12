import { describe, it, expect, beforeEach } from "vitest";
import {
  applyPatterns,
  PatternRegistry,
} from "@/patterns/registry";
import { scanMetaTags, scanCanonicalLink, scanJsonLd } from "@/patterns/sources";
import { citationsSet } from "@/patterns/sets/citations";

function reg(): PatternRegistry {
  const r = new PatternRegistry();
  r.register(citationsSet);
  return r;
}

beforeEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe("scanMetaTags", () => {
  it("extracts citation_doi with confidence 1.0", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "citation_doi");
    meta.setAttribute("content", "10.1038/nature12373");
    document.head.append(meta);

    const findings = scanMetaTags(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.patternId).toBe("doi");
    expect(findings[0]!.text).toBe("10.1038/nature12373");
    expect(findings[0]!.confidence).toBe(1.0);
    expect(findings[0]!.source).toBe("meta");
  });

  it("extracts citation_arxiv_id", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "citation_arxiv_id");
    meta.setAttribute("content", "2401.01234");
    document.head.append(meta);

    const findings = scanMetaTags(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.patternId).toBe("arxiv.id");
    expect(findings[0]!.text).toBe("2401.01234");
  });

  it("extracts citation_pmid and citation_pmcid", () => {
    const pmid = document.createElement("meta");
    pmid.setAttribute("name", "citation_pmid");
    pmid.setAttribute("content", "33445566");
    document.head.append(pmid);
    const pmcid = document.createElement("meta");
    pmcid.setAttribute("name", "citation_pmcid");
    pmcid.setAttribute("content", "PMC123456");
    document.head.append(pmcid);

    const findings = scanMetaTags(document);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.patternId).sort()).toEqual(["pmcid", "pmid"]);
  });

  it("extracts citation_doi_url (the URL form)", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "citation_doi_url");
    meta.setAttribute("content", "https://doi.org/10.1038/nature12373");
    document.head.append(meta);

    const findings = scanMetaTags(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.patternId).toBe("doi.url");
    expect(findings[0]!.text).toBe("10.1038/nature12373");
  });

  it("ignores unknown citation_* tags (e.g. citation_title)", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "citation_title");
    meta.setAttribute("content", "Some paper title");
    document.head.append(meta);
    expect(scanMetaTags(document)).toHaveLength(0);
  });

  it("ignores non-citation meta tags", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "viewport");
    meta.setAttribute("content", "width=device-width");
    document.head.append(meta);
    expect(scanMetaTags(document)).toHaveLength(0);
  });

  it("finds meta tags inside shadow roots", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const meta = document.createElement("meta");
    meta.setAttribute("name", "citation_doi");
    meta.setAttribute("content", "10.1234/shadow");
    shadow.append(meta);
    document.body.append(host);

    const findings = scanMetaTags(host);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.text).toBe("10.1234/shadow");
  });
});

describe("scanCanonicalLink", () => {
  it("extracts arXiv from canonical URL with confidence 0.9", () => {
    const link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", "https://arxiv.org/abs/2401.01234");
    document.head.append(link);

    const findings = scanCanonicalLink(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.patternId).toBe("arxiv.id");
    expect(findings[0]!.text).toBe("2401.01234");
    expect(findings[0]!.confidence).toBe(0.9);
    expect(findings[0]!.source).toBe("canonical");
  });

  it("extracts DOI from canonical URL", () => {
    const link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", "https://doi.org/10.1038/nature12373");
    document.head.append(link);

    const findings = scanCanonicalLink(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.patternId).toBe("doi");
    expect(findings[0]!.text).toBe("10.1038/nature12373");
  });

  it("ignores canonical URL without citation", () => {
    const link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", "https://example.com/page");
    document.head.append(link);
    expect(scanCanonicalLink(document)).toHaveLength(0);
  });

  it("ignores non-canonical links", () => {
    const link = document.createElement("link");
    link.setAttribute("rel", "stylesheet");
    link.setAttribute("href", "https://arxiv.org/abs/2401.01234");
    document.head.append(link);
    expect(scanCanonicalLink(document)).toHaveLength(0);
  });
});

describe("scanJsonLd", () => {
  it("extracts DOI from identifier field (confidence 0.95)", () => {
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ScholarlyArticle",
      identifier: "10.1038/nature12373",
    });
    document.head.append(script);

    const findings = scanJsonLd(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.patternId).toBe("doi");
    expect(findings[0]!.text).toBe("10.1038/nature12373");
    expect(findings[0]!.confidence).toBe(0.95);
    expect(findings[0]!.source).toBe("json-ld");
  });

  it("extracts arXiv ID from identifier (URL form)", () => {
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.textContent = JSON.stringify({
      "@type": "ScholarlyArticle",
      identifier: "https://arxiv.org/abs/2401.01234v2",
    });
    document.head.append(script);

    const findings = scanJsonLd(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.patternId).toBe("arxiv.id");
    expect(findings[0]!.text).toBe("2401.01234v2");
  });

  it("handles @graph array", () => {
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.textContent = JSON.stringify({
      "@graph": [
        { "@type": "Person", name: "Author" },
        { "@type": "ScholarlyArticle", identifier: "10.1234/x" },
      ],
    });
    document.head.append(script);

    const findings = scanJsonLd(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.text).toBe("10.1234/x");
  });

  it("extracts from sameAs URL", () => {
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.textContent = JSON.stringify({
      "@type": "ScholarlyArticle",
      sameAs: ["https://doi.org/10.1038/nature12373"],
    });
    document.head.append(script);

    const findings = scanJsonLd(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.text).toBe("10.1038/nature12373");
  });

  it("skips malformed JSON silently", () => {
    const script = document.createElement("script");
    script.setAttribute("type", "application/ld+json");
    script.textContent = "{ not valid json";
    document.head.append(script);
    expect(scanJsonLd(document)).toHaveLength(0);
  });

  it("skips non-JSON-LD scripts", () => {
    const script = document.createElement("script");
    script.setAttribute("type", "text/javascript");
    script.textContent = JSON.stringify({ identifier: "10.1038/x" });
    document.head.append(script);
    expect(scanJsonLd(document)).toHaveLength(0);
  });
});

describe("applyPatterns — confidence ladder integration", () => {
  it("emits both text-body and meta-tag findings for the same DOI", () => {
    // A page that mentions 10.1038/x in text AND has it in a
    // citation_doi meta tag. Both should appear, the meta one
    // with confidence 1.0, the text one with 0.7.
    const meta = document.createElement("meta");
    meta.setAttribute("name", "citation_doi");
    meta.setAttribute("content", "10.1038/x");
    document.head.append(meta);

    const p = document.createElement("p");
    p.append(document.createTextNode("See DOI 10.1038/x for details."));
    document.body.append(p);

    const findings = applyPatterns(document.body, reg());
    // At least one text-body match and one meta match.
    const textMatches = findings.filter((f) => f.source === "text");
    const metaMatches = findings.filter((f) => f.source === "meta");
    expect(textMatches.length).toBeGreaterThan(0);
    expect(metaMatches.length).toBe(1);
    expect(metaMatches[0]!.confidence).toBe(1.0);
  });

  it("text-body matches default to confidence 0.7 (no meta tag)", () => {
    const p = document.createElement("p");
    p.append(document.createTextNode("Reference: arXiv:2401.01234"));
    document.body.append(p);

    const findings = applyPatterns(document.body, reg());
    const text = findings.filter((f) => f.source === "text");
    expect(text[0]!.confidence).toBe(0.7);
  });

  it("confidenceBelow falsifier would drop text-body but not meta-tag (verified by confidence values)", () => {
    // The whole point of the confidence ladder. The mechanism is
    // tested in falsifiers.test.ts; here we just verify the
    // confidence values that the user would compare against
    // `{ confidenceBelow: 0.85 }`.
    const meta = document.createElement("meta");
    meta.setAttribute("name", "citation_doi");
    meta.setAttribute("content", "10.1038/x");
    document.head.append(meta);
    const p = document.createElement("p");
    p.append(document.createTextNode("See DOI 10.1038/x for details."));
    document.body.append(p);

    const findings = applyPatterns(document.body, reg());
    const metaF = findings.find((f) => f.source === "meta");
    const textF = findings.find(
      (f) => f.source === "text" && f.patternId === "doi"
    );
    expect(metaF?.confidence).toBe(1.0);
    expect(textF?.confidence).toBe(0.7);
    // Meta survives a `{ confidenceBelow: 0.85 }` filter; text does not.
    expect((metaF?.confidence ?? 0) >= 0.85).toBe(true);
    expect((textF?.confidence ?? 1) >= 0.85).toBe(false);
  });
});
