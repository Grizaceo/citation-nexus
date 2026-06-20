// Citation Nexus — Finding deduplication
//
// When a paper is cited multiple times on a page (e.g. in the
// abstract, intro, and bibliography), the scanner produces N
// findings with the same `text`. Rendering each as its own row
// gives the user N identical "Open" buttons that all go to the
// same URL — pure noise. This module groups findings by paper
// / concept identity so the popup can render one row per unique
// mention target, with a "× N" badge for the suppressed copies.
//
// Design notes:
//   - Dedup key: (category, normalizedText). The category matters
//     because the same surface form can have different meanings
//     across categories (e.g. "Llama-3" the model vs a hypothetical
//     "Llama-3" the chemical). Text is normalized to lowercase +
//     trimmed + whitespace-collapsed so "arXiv:2401.01234" and
//     "  ARXIV:2401.01234  " collapse to one group.
//   - Representative: highest source+confidence rank wins. The
//     source rank (meta > json-ld > canonical > opengraph ~
//     microdata > text) is the strong tiebreaker; confidence is
//     the finer one. This means a meta-tag finding with conf=1.0
//     beats a text-body finding with conf=0.7 for the same DOI —
//     the user sees the most authoritative version.
//   - Order: groups sort by category (alphabetical) then by
//     first-appearance start offset. First-appearance is the min
//     start across the representative + all mentions, so a paper
//     cited first in the abstract and again in the bibliography
//     shows up at the position of the abstract mention.
//   - Scope: this dedup also subsumes TODOS.md P2 "Deduplicate
//     text-vs-meta findings with the same ID" — that case is
//     just one example of the general rule (text + meta with
//     same ID, same category, same normalizedText).

import type { Finding, FindingSource } from "@/patterns/core";

/** A group of findings that all refer to the same paper / concept.
 *  The `representative` is the highest-rank member; `mentions` are
 *  the suppressed duplicates (does NOT include the representative).
 *  `mentionCount` is always >= 1 and equals `mentions.length + 1`. */
export interface FindingGroup {
  representative: Finding;
  mentionCount: number;
  mentions: Finding[];
}

/** Source rank: used to break confidence ties (and to handle the
 *  case where two findings have the same confidence but different
 *  sources). Higher = more authoritative. The exact numbers are
 *  arbitrary; the relative order is what matters. */
const SOURCE_RANK: Record<FindingSource, number> = {
  meta: 5, // <meta name="citation_*">  conf 1.0
  "json-ld": 4, // conf 0.95
  canonical: 3, // conf 0.9
  opengraph: 2, // conf 0.85
  microdata: 2, // conf 0.85
  text: 1, // conf 0.7
  anchor: 0, // conf 0.6 — collection-page / list-page hrefs.
             // The href is a navigation hint, not an authoritative
             // claim; we keep it strictly below text-body matches
             // (0.7) so a paper cited in prose still wins as the
             // representative over a paper that's only linked.
             // See `scanAnchorHrefs` in sources.ts.
};

/** Composite rank: confidence is primary, source is the
 *  tiebreaker. Returns a number where higher = better candidate
 *  for the dedup representative. */
function rankFor(f: Finding): number {
  return (f.confidence ?? 0) * 1000 + (SOURCE_RANK[f.source] ?? 0);
}

/** Normalize text for the dedup key. Lowercase + trim + collapse
 *  internal whitespace runs to a single space. Also strip a
 *  trailing arXiv-style version suffix (`v2`, `vN`) so the
 *  meta-tag capture (often without version) and the text-body
 *  capture (often with `vN`) collapse to the same group. The
 *  strip is gated on the preceding character being a digit —
 *  arXiv IDs always end in a digit before the version, so this
 *  is precise for the intended target and avoids accidentally
 *  mangling words like `lev1` or `rev2` that happen to end in
 *  `v<digit>`. Safe for other patterns: DOIs / PMIDs / GitHub
 *  URLs don't use the `v<digits>` suffix, so the strip is a
 *  no-op on them. */
function normalize(text: string): string {
  const base = text.toLowerCase().replace(/\s+/g, " ").trim();
  return base.replace(/(\d)v\d+$/, "$1");
}

/** Group findings by (category, normalizedText). Within each group
 *  the first member is the highest-rank finding (the
 *  representative); the rest are the suppressed mentions. The
 *  returned groups are sorted by category, then by first
 *  appearance of any member in the source text. */
export function dedupeFindings(findings: Finding[]): FindingGroup[] {
  const buckets = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.category}\0${normalize(f.text)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(f);
    else buckets.set(key, [f]);
  }
  const out: FindingGroup[] = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => rankFor(b) - rankFor(a));
    out.push({
      representative: arr[0]!,
      mentionCount: arr.length,
      mentions: arr.slice(1),
    });
  }
  // Group order: category (alphabetical), then first-appearance
  // start. We pick the MIN start across representative + mentions
  // so a group whose first mention is in the intro (start=20)
  // sorts before one whose only mention is in the bibliography
  // (start=4000) — even if the bibliography mention is the
  // highest-rank and was chosen as the representative.
  out.sort((a, b) => {
    const catCmp = a.representative.category.localeCompare(
      b.representative.category
    );
    if (catCmp !== 0) return catCmp;
    const aStart = Math.min(
      a.representative.start,
      ...a.mentions.map((m) => m.start)
    );
    const bStart = Math.min(
      b.representative.start,
      ...b.mentions.map((m) => m.start)
    );
    return aStart - bStart;
  });
  return out;
}
