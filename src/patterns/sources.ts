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
  // The publisher's direct PDF URL (PubMed Central uses this;
  // some other Highwire-compliant publishers do too). We
  // recognize it as a separate pattern so the downloader can
  // use the URL as-is instead of constructing one from the DOI.
  citation_pdf_url: {
    patternId: "pdf_url",
    extract: (raw) => raw.trim(),
  },
  // Dublin Core (DC.*) meta tags. Legacy / institutional
  // repositories that predate the Highwire convention often
  // use DC.identifier to carry a DOI or URL. We extract the
  // DOI/arxiv value from the DC.identifier content. Other
  // DC.* tags (DC.title, DC.creator, ...) are not relevant
  // to citation download paths and are not mapped.
  dc_identifier: {
    patternId: "dc.identifier",
    extract: (raw) => raw.trim(),
  },
};

/** Walk for <meta name="citation_*"> and <meta name="DC.*"> tags
 *  and emit findings. The Highwire / Google Scholar convention
 *  (citation_*) is the primary standard; Dublin Core (DC.*)
 *  is the older academic-repository standard, still in use on
 *  legacy institutional pages. */
export function scanMetaTags(root: Node): PureFinding[] {
  const out: PureFinding[] = [];
  // Find every <meta name="citation_*"> or <meta name="DC.*">
  // in the tree. Use a deep tree walk that includes element
  // nodes so we don't depend on selector engines (cheap enough
  // for the typical page).
  const metas: HTMLMetaElement[] = [];
  walkElements(root, (el) => {
    if (el.tagName !== "META") return;
    const name = (el as HTMLMetaElement).name ?? "";
    // case-insensitive check for citation_* OR DC.* (Dublin Core)
    const lower = name.toLowerCase();
    if (lower.startsWith("citation_") || lower.startsWith("dc.")) {
      metas.push(el as HTMLMetaElement);
    }
  });
  for (const meta of metas) {
    const name = meta.name;
    // Look up the mapper case-insensitively, normalizing the
    // `.` to `_` so Dublin Core meta names (e.g. "DC.identifier")
    // match the same shape as the Highwire keys (e.g. "citation_doi"
    // where the key uses `_` for the same delimiter).
    const normalized = name.toLowerCase().replace(/\./g, "_");
    const mapper = META_TAG_MAP[normalized];
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
  // Direct identifier strings. `description` is included because
  // YouTube puts the arXiv ID of the discussed paper in the video
  // description (a free-text JSON-LD field). When the walker
  // finds "arXiv:2605.22166" in that string, classifyAndEmit
  // extracts the ID and we emit a high-confidence finding. Without
  // this, a YouTube video about an arXiv paper produces only a
  // low-confidence text-match finding (source="text", no [Save]
  // button in the popup) — a real usability gap. Discovered
  // during dogfooding on 2026-06-13.
  for (const key of ["identifier", "doi", "sameAs", "url", "description"]) {
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
  // arXiv form: URL (arxiv.org/abs/...) OR prefixed
  // ("arXiv:NNNN.NNNNN", case-insensitive). The prefix form is
  // common in free-text JSON-LD fields like the YouTube video
  // description and academic blog posts. The URL form was the
  // only one matched before, so prefix-form citations slipped
  // through to the low-confidence text scanner. Discovered
  // during dogfooding on 2026-06-13: a YouTube video about an
  // arXiv paper had the arXiv ID only in `arXiv:NNNN.NNNNN`
  // format inside the JSON-LD description.
  const arxiv = trimmed.match(
    /(?:arxiv\.org\/(?:abs|pdf)\/|arXiv:\s*)(\d{4}\.\d{4,5}(?:v\d+)?)/i
  );
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

/** Walk for OpenGraph <meta property="og:..."> tags. Many blogs
 *  and social-media-derived pages set og:url to the canonical
 *  paper URL (often a doi.org link) even when no citation_*
 *  meta tags are present. We extract DOIs and arXiv IDs from
 *  the og:url and og:see_also values and emit findings at
 *  confidence 0.85 — below canonical (0.9) because og: is a
 *  publisher-declared social-media hint rather than an
 *  authoritative claim. Still well above the 0.85 download
 *  threshold so [Save] works for these pages. */
export function scanOpenGraph(root: Node): PureFinding[] {
  const out: PureFinding[] = [];
  walkElements(root, (el) => {
    if (el.tagName !== "META") return;
    const meta = el as HTMLMetaElement;
    const prop = meta.getAttribute("property")?.toLowerCase();
    if (!prop?.startsWith("og:")) return;
    const value = meta.content ?? "";
    if (!value) return;
    // og:url is the canonical URL the publisher wants social
    // cards to point to. og:see_also can list related URLs.
    if (prop === "og:url" || prop === "og:see_also") {
      // DOI form (bare or doi.org URL)
      const doi = value.match(/(?:doi\.org\/)?(10\.\d{4,9}\/[^?\s#]+)/i);
      if (doi) {
        out.push({
          patternId: "doi",
          category: "citation",
          label: `og:url DOI`,
          text: doi[1]!,
          start: 0,
          end: doi[1]!.length,
          originalLength: doi[1]!.length,
          priority: 0,
          source: "opengraph",
          confidence: 0.85,
        });
        return;
      }
      // arXiv form (URL or prefix)
      const arxiv = value.match(
        /(?:arxiv\.org\/(?:abs|pdf)\/|arXiv:\s*)(\d{4}\.\d{4,5}(?:v\d+)?)/i
      );
      if (arxiv) {
        out.push({
          patternId: "arxiv.id",
          category: "citation",
          label: `og:url arXiv`,
          text: arxiv[1]!,
          start: 0,
          end: arxiv[1]!.length,
          originalLength: arxiv[1]!.length,
          priority: 0,
          source: "opengraph",
          confidence: 0.85,
        });
      }
    }
  });
  return out;
}

/** Convenience: scan ALL high-confidence sources in one call. */
export function scanAllSources(root: Node): PureFinding[] {
  return [
    ...scanMetaTags(root),
    ...scanCanonicalLink(root),
    ...scanJsonLd(root),
    ...scanOpenGraph(root),
    ...scanMicrodata(root),
  ];
}

/** Walk for Schema.org microdata (itemscope / itemprop / itemtype).
 *  Many academic blogs and institutional pages mark up their
 *  paper references with HTML microdata instead of (or in
 *  addition to) JSON-LD. The shape is:
 *
 *    <div itemscope itemtype="https://schema.org/ScholarlyArticle">
 *      <span itemprop="name">Paper title</span>
 *      <span itemprop="identifier">10.1038/nature12373</span>
 *      <span itemprop="identifier">arXiv:2401.01234</span>
 *    </div>
 *
 *  We extract DOI and arXiv values from `itemprop="identifier"`
 *  (and a few related itemprop names: doi, sameAs) and emit
 *  findings with source="microdata" and confidence=0.85 —
 *  same threshold as og:url. Microdata is page-authored and
 *  easy to fake, so we keep it below the meta-tag (1.0) and
 *  JSON-LD (0.95) tiers. The function only walks elements
 *  that have an itemscope ancestor; loose itemprop attributes
 *  without a parent itemscope are not real microdata and are
 *  ignored. */
export function scanMicrodata(root: Node): PureFinding[] {
  const out: PureFinding[] = [];
  walkElements(root, (el) => {
    if (el.tagName !== "DIV" && el.tagName !== "SECTION" && el.tagName !== "ARTICLE") {
      return;
    }
    if (!el.hasAttribute("itemscope")) return;
    // Only act on academic / document-type itemscopes. Other
    // itemtypes (Person, Organization, Product, ...) almost
    // never carry citation identifiers.
    const itemtype = el.getAttribute("itemtype")?.toLowerCase() ?? "";
    const isAcademic =
      itemtype.includes("scholarlyarticle") ||
      itemtype.includes("creativework") ||
      itemtype.includes("article") ||
      itemtype.includes("publication") ||
      itemtype === ""; // bare itemscope with no itemtype — accept defensively
    if (!isAcademic) return;
    // Walk descendants looking for itemprop attributes. We
    // use a scoped search (not document-wide) so two adjacent
    // ScholarlyArticle blocks don't cross-contaminate.
    const descendants = el.querySelectorAll("[itemprop]");
    for (const desc of descendants) {
      const prop = desc.getAttribute("itemprop")?.toLowerCase() ?? "";
      if (
        prop !== "identifier" &&
        prop !== "doi" &&
        prop !== "sameas" &&
        prop !== "url"
      ) {
        continue;
      }
      // Microdata value lookup: HTMLMicrodataElement spec says
      // a) the element's `content` attribute (only on <meta>),
      // b) the element's `href` (on <a>, <link>, <area>, ...),
      // c) the element's `src` (on <img>, <iframe>, <source>, ...),
      // d) otherwise the element's textContent. We check all
      // four because real pages mix the conventions. Empty
      // values are skipped.
      const value =
        desc.getAttribute("content") ??
        desc.getAttribute("href") ??
        desc.getAttribute("src") ??
        (desc.textContent ?? "").trim();
      if (!value) continue;
      // DOI form (bare or doi.org URL)
      const doi = value.match(/(?:doi\.org\/)?(10\.\d{4,9}\/[^?\s#]+)/i);
      if (doi) {
        out.push({
          patternId: "doi",
          category: "citation",
          label: `microdata ${prop}`,
          text: doi[1]!,
          start: 0,
          end: doi[1]!.length,
          originalLength: doi[1]!.length,
          priority: 0,
          source: "microdata",
          confidence: 0.85,
        });
        continue;
      }
      // arXiv form (URL or prefix)
      const arxiv = value.match(
        /(?:arxiv\.org\/(?:abs|pdf)\/|arXiv:\s*)(\d{4}\.\d{4,5}(?:v\d+)?)/i
      );
      if (arxiv) {
        out.push({
          patternId: "arxiv.id",
          category: "citation",
          label: `microdata ${prop}`,
          text: arxiv[1]!,
          start: 0,
          end: arxiv[1]!.length,
          originalLength: arxiv[1]!.length,
          priority: 0,
          source: "microdata",
          confidence: 0.85,
        });
      }
    }
  });
  return out;
}
