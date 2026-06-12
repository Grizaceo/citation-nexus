// Citation Nexus — High-confidence source scanners
//
// The text-body scanner (`applyPatterns`) walks text nodes and
// applies regexes. That's noisy: every "version 1.2.3" can
// look like a DOI to the wrong regex. Publishers, by contrast,
// embed structured citation metadata in three well-known places:
//
//   1. <meta name="citation_*"> tags (Highwire Press / Google
//      Scholar convention). These are tiny `<meta>` elements
//      inside `<head>` with name= and content=. The content is
//      a high-confidence source — the publisher put it there.
//      Confidence: 1.0.
//
//   2. <script type="application/ld+json"> blocks. schema.org's
//      ScholarlyArticle type includes `identifier` (DOI/arxiv),
//      `sameAs` (URLs), etc. The publisher's own JSON-LD
//      payload, so highly reliable. Confidence: 0.95.
//
//   3. <link rel="canonical" href="...">. When the canonical URL
//      contains an arXiv/DOI/PMID, the publisher is telling us
//      "this is the canonical version". Confidence: 0.9.
//
// Each scanner returns PureFinding[] (no DOM node ref) so the
// caller can mix them with text-body findings and let the
// Falsifier system apply uniformly. The DOM-walker entry point
// `applyPatterns` calls these and merges.

import type { Category, PatternSet, PureFinding } from "./core";

/** High-confidence publishers' metadata → pattern id. The keys are
 *  the Highwire Press / Google Scholar convention used by most
 *  scientific publishers. */
const META_TAG_MAP: Record<string, { patternId: string; extract: (raw: string) => string | null }> = {
  citation_doi: {
    patternId: "doi",
    // content is the bare DOI like "10.1038/nature12373"
    extract: (raw) => raw.trim(),
  },
  citation_doi_url: {
    patternId: "doi.url",
    // content is the full URL like "https://doi.org/10.1038/..."
    // We extract the DOI portion (the registry's doi.url regex
    // already does this on the text body; for meta tags we
    // simulate the same outcome).
    extract: (raw) => {
      const m = raw.trim().match(/doi\.org\/(10\.\d{4,9}\/[^"\s<>]+)/i);
      return m ? m[1]! : raw.trim();
    },
  },
  citation_arxiv_id: {
    patternId: "arxiv.id",
    // content is the bare ID like "2401.01234" or "2401.01234v1"
    extract: (raw) => raw.trim(),
  },
  citation_pmid: {
    patternId: "pmid",
    extract: (raw) => raw.trim(),
  },
  citation_pmcid: {
    patternId: "pmcid",
    extract: (raw) => raw.trim(),
  },
};

/** Walk for <meta name="citation_*"> tags and emit findings. */
export function scanMetaTags(root: Node): PureFinding[] {
  const out: PureFinding[] = [];
  // Find every <meta name="citation_*"> in the tree. Use a deep
  // tree walk that includes element nodes so we don't depend on
  // selector engines (cheap enough for the typical page).
  const metas: HTMLMetaElement[] = [];
  walkElements(root, (el) => {
    if (
      el.tagName === "META" &&
      (el as HTMLMetaElement).name?.startsWith("citation_")
    ) {
      metas.push(el as HTMLMetaElement);
    }
  });
  for (const meta of metas) {
    const name = meta.name;
    const mapper = META_TAG_MAP[name];
    if (!mapper) continue;
    const content = meta.content ?? "";
    const text = mapper.extract(content);
    if (!text) continue;
    out.push({
      patternId: mapper.patternId,
      category: "citation",
      label: name,
      text,
      start: 0,
      end: text.length,
      originalLength: text.length,
      priority: 0,
      source: "meta",
      confidence: 1.0, // ← the whole point of meta tags
    });
  }
  return out;
}

/** Walk for <link rel="canonical" href="..."> and emit if the
 *  URL contains a recognizable citation identifier. Confidence
 *  0.9 (lower than meta tag because canonical is more often
 *  about URL preference than citation identity). */
export function scanCanonicalLink(root: Node): PureFinding[] {
  const out: PureFinding[] = [];
  walkElements(root, (el) => {
    if (el.tagName !== "LINK") return;
    const link = el as HTMLLinkElement;
    if (link.rel?.toLowerCase() !== "canonical") return;
    const href = link.href ?? "";
    // arXiv URL form
    const arxiv = href.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
    if (arxiv) {
      out.push({
        patternId: "arxiv.id",
        category: "citation",
        label: "canonical link arXiv",
        text: arxiv[1]!,
        start: 0,
        end: arxiv[1]!.length,
        originalLength: arxiv[1]!.length,
        priority: 0,
        source: "canonical",
        confidence: 0.9,
      });
      return;
    }
    // DOI URL form
    const doi = href.match(/doi\.org\/(10\.\d{4,9}\/[^?\s#]+)/i);
    if (doi) {
      out.push({
        patternId: "doi",
        category: "citation",
        label: "canonical link DOI",
        text: doi[1]!,
        start: 0,
        end: doi[1]!.length,
        originalLength: doi[1]!.length,
        priority: 0,
        source: "canonical",
        confidence: 0.9,
      });
    }
  });
  return out;
}

/** Walk for <script type="application/ld+json"> blocks, parse them,
 *  and emit findings for known citation identifiers inside the
 *  JSON-LD graph. Confidence 0.95. */
export function scanJsonLd(root: Node): PureFinding[] {
  const out: PureFinding[] = [];
  walkElements(root, (el) => {
    if (el.tagName !== "SCRIPT") return;
    const script = el as HTMLScriptElement;
    if (script.type?.toLowerCase() !== "application/ld+json") return;
    const raw = script.textContent ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return; // malformed JSON-LD; skip silently
    }
    walkJsonLd(parsed, (identifier, kind) => {
      // kind is "doi" or "arxiv" or "pmid" — mapped from the
      // JSON-LD node type. We only emit if the identifier looks
      // like a valid citation.
      if (kind === "doi") {
        const m = identifier.match(/^10\.\d{4,9}\/.+/);
        if (!m) return;
        out.push({
          patternId: "doi",
          category: "citation",
          label: "JSON-LD DOI",
          text: m[0],
          start: 0,
          end: m[0].length,
          originalLength: m[0].length,
          priority: 0,
          source: "json-ld",
          confidence: 0.95,
        });
      } else if (kind === "arxiv") {
        const m = identifier.match(/(\d{4}\.\d{4,5}(?:v\d+)?)/);
        if (!m) return;
        out.push({
          patternId: "arxiv.id",
          category: "citation",
          label: "JSON-LD arXiv",
          text: m[1]!,
          start: 0,
          end: m[1]!.length,
          originalLength: m[1]!.length,
          priority: 0,
          source: "json-ld",
          confidence: 0.95,
        });
      } else if (kind === "pmid") {
        const m = identifier.match(/^\d+$/);
        if (!m) return;
        out.push({
          patternId: "pmid",
          category: "citation",
          label: "JSON-LD PMID",
          text: m[0],
          start: 0,
          end: m[0].length,
          originalLength: m[0].length,
          priority: 0,
          source: "json-ld",
          confidence: 0.95,
        });
      }
    });
  });
  return out;
}

/** Type guard for objects (so we can safely descend into JSON-LD
 *  without TypeScript complaining). */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursive walker for JSON-LD. Calls emit for every identifier
 *  it finds, along with a guess at what KIND of identifier
 *  (doi, arxiv, pmid) based on @type and field names. */
function walkJsonLd(
  node: unknown,
  emit: (identifier: string, kind: "doi" | "arxiv" | "pmid") => void
): void {
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, emit);
    return;
  }
  if (!isObject(node)) return;
  // Direct identifier strings
  for (const key of ["identifier", "doi", "sameAs", "url"]) {
    const v = node[key];
    if (typeof v === "string") {
      classifyAndEmit(v, emit);
    } else if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === "string") classifyAndEmit(item, emit);
        else if (isObject(item)) walkJsonLd(item, emit);
      }
    } else if (isObject(v)) {
      // identifier can be a PropertyValue with name/value
      if (typeof v.value === "string") {
        classifyAndEmit(v.value, emit);
      } else {
        walkJsonLd(v, emit);
      }
    }
  }
  // Recurse into @graph
  if (Array.isArray(node["@graph"])) {
    walkJsonLd(node["@graph"], emit);
  }
}

function classifyAndEmit(
  raw: string,
  emit: (identifier: string, kind: "doi" | "arxiv" | "pmid") => void
): void {
  const trimmed = raw.trim();
  if (!trimmed) return;
  // DOI form (either bare or doi.org URL)
  const doi = trimmed.match(/(?:doi\.org\/)?(10\.\d{4,9}\/[^?\s#]+)/i);
  if (doi) {
    emit(doi[1]!, "doi");
    return;
  }
  // arXiv form
  const arxiv = trimmed.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)/i);
  if (arxiv) {
    emit(arxiv[1]!, "arxiv");
    return;
  }
  // PMID form (bare digits; would need PubMed context to be sure
  // but JSON-LD is high-confidence by definition)
  if (/^\d{6,9}$/.test(trimmed)) {
    emit(trimmed, "pmid");
  }
}

/** Lightweight element walker. Visits every Element under `root`
 *  (including elements inside shadow roots — the open-DOM
 *  caveat we already deal with in `applyPatterns`). */
function walkElements(root: Node, visit: (el: Element) => void): void {
  if (root.nodeType === 1 /* ELEMENT_NODE */) {
    visit(root as Element);
  }
  if ((root as Element).shadowRoot) {
    walkElements((root as Element).shadowRoot!, visit);
  }
  const children = (root as ParentNode).childNodes;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c) walkElements(c, visit);
  }
}

/** Re-export for tests. */
export const _internal = { walkElements, walkJsonLd, classifyAndEmit };

/** Convenience: scan ALL high-confidence sources in one call. */
export function scanAllSources(root: Node): PureFinding[] {
  return [
    ...scanMetaTags(root),
    ...scanCanonicalLink(root),
    ...scanJsonLd(root),
  ];
}
