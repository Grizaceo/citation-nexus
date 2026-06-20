import { describe, it, expect } from "vitest";
import type { Finding } from "@/patterns/core";
import { dedupeFindings } from "./dedupe";

/** Build a Finding with sensible defaults. We don't care about
 *  the `node` field in dedup, so it's stubbed. */
function f(
  overrides: Partial<Finding> & { category: Finding["category"]; text: string }
): Finding {
  return {
    patternId: "arxiv.id",
    label: "arXiv",
    start: 0,
    end: 0,
    node: {} as Text,
    source: "text",
    confidence: 0.7,
    ...overrides,
  };
}

describe("dedupeFindings", () => {
  it("returns [] for empty input", () => {
    expect(dedupeFindings([])).toEqual([]);
  });

  it("returns a single group for a single finding", () => {
    const a = f({ category: "citation", text: "arXiv:2401.01234" });
    const g = dedupeFindings([a]);
    expect(g).toHaveLength(1);
    expect(g[0]!.representative).toBe(a);
    expect(g[0]!.mentionCount).toBe(1);
    expect(g[0]!.mentions).toEqual([]);
  });

  it("merges two identical text-body findings into one group", () => {
    const a = f({
      category: "citation",
      text: "arXiv:2401.01234",
      start: 10,
      end: 22,
      confidence: 0.7,
    });
    const b = f({
      category: "citation",
      text: "arXiv:2401.01234",
      start: 100,
      end: 112,
      confidence: 0.7,
    });
    const g = dedupeFindings([a, b]);
    expect(g).toHaveLength(1);
    expect(g[0]!.mentionCount).toBe(2);
    // Both findings must be in the group somewhere (one as rep,
    // one as mention). The order depends on the stable sort
    // tiebreaker, which preserves input order for equal rank.
    expect([g[0]!.representative, ...g[0]!.mentions]).toEqual(
      expect.arrayContaining([a, b])
    );
  });

  it("merges text + meta of the same ID; meta wins as representative", () => {
    const textF = f({
      category: "citation",
      patternId: "arxiv.id",
      text: "2401.01234",
      source: "text",
      confidence: 0.7,
      start: 50,
      end: 61,
    });
    const metaF = f({
      category: "citation",
      patternId: "arxiv.id",
      text: "2401.01234",
      source: "meta",
      confidence: 1.0,
      start: 0,
      end: 0,
    });
    const g = dedupeFindings([textF, metaF]);
    expect(g).toHaveLength(1);
    expect(g[0]!.representative).toBe(metaF);
    expect(g[0]!.mentions).toEqual([textF]);
    expect(g[0]!.mentionCount).toBe(2);
  });

  it("does NOT merge across different categories even with same text", () => {
    const llm = f({
      category: "cs",
      text: "Llama-3",
      source: "text",
      confidence: 0.7,
    });
    const hypothetical = f({
      category: "chemistry",
      text: "Llama-3",
      source: "text",
      confidence: 0.7,
    });
    const g = dedupeFindings([llm, hypothetical]);
    expect(g).toHaveLength(2);
  });

  it("normalizes text for the dedup key (case + outer whitespace)", () => {
    // The actual citation regexes capture the bare ID (no
    // surrounding prefix/punctuation), so the only variations
    // we see in practice are case and outer whitespace. Both
    // collapse to the same group.
    const a = f({ category: "citation", text: "arXiv:2401.01234" });
    const b = f({ category: "citation", text: "  ARXIV:2401.01234  " });
    const c = f({ category: "citation", text: "ARXIV:2401.01234" });
    const g = dedupeFindings([a, b, c]);
    expect(g).toHaveLength(1);
    expect(g[0]!.mentionCount).toBe(3);
  });

  it("does NOT merge different IDs that share a prefix", () => {
    const a = f({ category: "citation", text: "arXiv:2401.01234" });
    const b = f({ category: "citation", text: "arXiv:2401.01235" });
    const g = dedupeFindings([a, b]);
    expect(g).toHaveLength(2);
  });

  it("merges 6 text-body mentions of the same arXiv id (the bug)", () => {
    // This is the user's reported case: a paper cited 6 times on
    // the same page produces 6 rows, all opening the same URL.
    const six = Array.from({ length: 6 }, (_, i) =>
      f({
        category: "citation",
        text: "arXiv:1706.03762",
        start: 10 + i * 50,
        end: 22 + i * 50,
        confidence: 0.7,
      })
    );
    const g = dedupeFindings(six);
    expect(g).toHaveLength(1);
    expect(g[0]!.mentionCount).toBe(6);
  });

  it("merges arXiv mentions with and without version suffix", () => {
    // The real-world regression on arXiv abstract pages: the
    // meta tag `citation_arxiv_id` typically has the bare ID
    // (no version), while text-body matches often include the
    // version (`arXiv:2401.01234v3`). The arxiv.id regex
    // captures the digits-only part, so the finding.text for
    // the text-body match is `2401.01234v3` (the prefix
    // `arXiv:` is not captured). Without the v-strip these
    // would be two separate groups; with the v-strip they
    // collapse.
    const metaF = f({
      category: "citation",
      patternId: "arxiv.id",
      text: "2401.01234",
      source: "meta",
      confidence: 1.0,
    });
    const textF = f({
      category: "citation",
      patternId: "arxiv.id",
      text: "2401.01234v3",
      source: "text",
      confidence: 0.7,
    });
    const textF2 = f({
      category: "citation",
      patternId: "arxiv.id",
      text: "2401.01234v7",
      source: "text",
      confidence: 0.7,
    });
    const g = dedupeFindings([metaF, textF, textF2]);
    expect(g).toHaveLength(1);
    expect(g[0]!.mentionCount).toBe(3);
    // Meta tag wins as rep (highest rank).
    expect(g[0]!.representative).toBe(metaF);
  });

  it("does NOT strip v-suffix from non-arXiv patterns", () => {
    // DOIs and PMIDs don't use the v<N> suffix, so the strip is
    // a no-op. This test pins the contract: if a future pattern
    // ever starts producing v<N>-shaped text and we don't want
    // it stripped, we'd add an explicit allowlist here.
    const a = f({ category: "citation", text: "10.1234/v1" });
    const b = f({ category: "citation", text: "10.1234" });
    const g = dedupeFindings([a, b]);
    expect(g).toHaveLength(2);
  });

  it("orders groups by category then by first appearance", () => {
    // math comes alphabetically before physics.
    const math = f({
      category: "math",
      patternId: "math.theorem",
      text: "Theorem 1.2",
      start: 0,
      end: 12,
    });
    const physicsLater = f({
      category: "physics",
      patternId: "physics.particle",
      text: "Z boson",
      start: 500,
      end: 507,
    });
    const physicsEarlier = f({
      category: "physics",
      patternId: "physics.particle",
      text: "muon",
      start: 10,
      end: 14,
    });
    const g = dedupeFindings([physicsLater, math, physicsEarlier]);
    expect(g.map((x) => x.representative.text)).toEqual([
      "Theorem 1.2", // math first
      "muon", // physics, earlier start
      "Z boson", // physics, later start
    ]);
  });

  it("preserves first-appearance order when rep is a high-rank source", () => {
    // The meta finding (start=0) is the highest-rank, so it
    // becomes the rep. But the text finding (start=200) is the
    // "first appearance" for ordering purposes. The group should
    // sort to the text's start position, not the meta's 0.
    const textF = f({
      category: "citation",
      text: "10.1038/x",
      source: "text",
      confidence: 0.7,
      start: 200,
    });
    const metaF = f({
      category: "citation",
      text: "10.1038/x",
      source: "meta",
      confidence: 1.0,
      start: 0,
    });
    const later = f({
      category: "citation",
      text: "10.1186/other",
      source: "text",
      confidence: 0.7,
      start: 500,
    });
    const g = dedupeFindings([textF, later, metaF]);
    // The text/meta group should sort at position 200, the later
    // group at 500. The rep being meta doesn't pull the group
    // up to position 0.
    expect(g).toHaveLength(2);
    expect(g[0]!.representative).toBe(metaF);
    expect(g[0]!.mentions).toContain(textF);
    expect(g[1]!.representative.text).toBe("10.1186/other");
  });

  it("uses confidence then source for representative tiebreak", () => {
    // Same text, same category, three sources. The expected
    // order is meta > json-ld > text.
    const textF = f({
      category: "citation",
      text: "DOI",
      source: "text",
      confidence: 0.7,
    });
    const jsonF = f({
      category: "citation",
      text: "DOI",
      source: "json-ld",
      confidence: 0.95,
    });
    const metaF = f({
      category: "citation",
      text: "DOI",
      source: "meta",
      confidence: 1.0,
    });
    const g = dedupeFindings([textF, jsonF, metaF]);
    expect(g).toHaveLength(1);
    expect(g[0]!.representative).toBe(metaF);
    expect(g[0]!.mentions).toEqual([jsonF, textF]);
  });

  it("anchor (conf 0.6) loses to text-body (conf 0.7) for the same ID", () => {
    // The motivating use case: a medrxiv collection page has
    // 50 anchor-href findings. If the page ALSO has the same
    // paper cited in prose (or via meta tag), the text/meta
    // finding must win as the representative. The anchor is a
    // suppressed mention. This pins the rank order: anchor=0 <
    // text=1 < microdata=2.
    const anchorF = f({
      category: "citation",
      patternId: "doi",
      text: "10.64898/2026.06.09.26353787v1",
      source: "anchor",
      confidence: 0.6,
    });
    const textF = f({
      category: "citation",
      patternId: "doi",
      text: "10.64898/2026.06.09.26353787v1",
      source: "text",
      confidence: 0.7,
    });
    const g = dedupeFindings([anchorF, textF]);
    expect(g).toHaveLength(1);
    expect(g[0]!.representative).toBe(textF);
    expect(g[0]!.mentions).toEqual([anchorF]);
    expect(g[0]!.mentionCount).toBe(2);
  });
});
