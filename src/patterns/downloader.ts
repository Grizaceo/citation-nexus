// Citation Nexus — Downloader
//
// Given a Finding, return a DownloadInfo (URL + vault path) or
// null if the finding can't be downloaded. Pure function — no
// fetch, no disk writes, no async. The actual HTTP + filesystem
// work happens in the native host (agent/native_host.py) and the
// bridge (bridge/nexus_bridge/server.py); this module just maps
// the abstract finding to concrete download coordinates.
//
// Gating: only CERTIFIED sources (meta tag, JSON-LD, canonical
// link) are downloadable. Text-body matches (regex on prose)
// are too noisy — a "10.1038/x" or "2401.01234" in random prose
// could be a coupon code, version number, telephone, etc. The
// confidence ladder we built is the gate: meta tags get 1.0,
// JSON-LD 0.95, canonical 0.9, text body 0.7. We require ≥ 0.85.
// This is the "solo en las certificadas como citas" rule from
// the product vision — the user wants no accidental downloads
// of arbitrary text-body matches that look like citations.

import type { Finding } from "@/patterns/core";

export type DownloadFormat = "pdf" | "html";

export interface DownloadInfo {
  /** URL to fetch. The fetcher (native host / bridge) GETs this. */
  url: string;
  /** Vault category folder. "citation" for all v1 downloads. */
  category: string;
  /** Filename WITHOUT extension, safe to use as a path segment. */
  filename: string;
  /** File extension (no leading dot). */
  format: DownloadFormat;
}

/** Minimum confidence for a finding to be downloadable. Meta tag
 *  = 1.0, JSON-LD = 0.95, canonical link = 0.9, text body = 0.7.
 *  Threshold of 0.85 means text body is excluded. */
const MIN_DOWNLOAD_CONFIDENCE = 0.85;

/**
 * Map a finding to its download coordinates, or null if:
 *   - the source isn't certified (text body)
 *   - the pattern isn't a downloadable citation in v1
 *   - the text is too short / too weird to build a safe filename
 */
export function getDownloadInfo(finding: Finding): DownloadInfo | null {
  // Source gate. The confidence field is set by the scanner:
  //   text body  -> 0.7
  //   meta tag    -> 1.0
  //   JSON-LD     -> 0.95
  //   canonical   -> 0.9
  // We require ≥ 0.85, which excludes text body.
  const conf = finding.confidence ?? 0;
  if (finding.source === "text" || conf < MIN_DOWNLOAD_CONFIDENCE) {
    return null;
  }

  switch (finding.patternId) {
    case "arxiv.id":
    case "arxiv.abs": {
      // arXiv bare ID: "2401.01234" or "2401.01234v1"
      // (the regex captures the bare ID; finding.text is that).
      const filename = sanitizeFilename(finding.text, "arxiv");
      if (!filename) return null;
      return {
        url: `https://arxiv.org/pdf/${finding.text}`,
        category: "citation",
        filename,
        format: "pdf",
      };
    }
    case "doi":
    case "doi.url": {
      // DOI form: "10.1038/nature12373"
      // URL form: "doi.org/10.1038/nature12373" (the .url regex
      // extracts the DOI portion, so finding.text is the same).
      // The fetcher follows the doi.org redirect; the response
      // might be a PDF (open access) or an HTML landing page
      // (paywall). Either way, the file goes to disk.
      const doiSlug = sanitizeFilename(finding.text, "doi");
      if (!doiSlug) return null;
      return {
        url: `https://doi.org/${finding.text}`,
        category: "citation",
        filename: doiSlug,
        // Most publishers redirect to HTML. We try to keep the
        // Content-Type from the response; the native host
        // records the actual extension used.
        format: "html",
      };
    }
    case "pmid": {
      // PMID is the PubMed identifier. PubMed pages often don't
      // include a citation_pdf_url (paywalled or not in PMC).
      // As a best-effort fallback we route to the Europe PMC
      // article landing page. Europe PMC hosts the same paper
      // (with full text when open access) and is the canonical
      // open mirror for PubMed. The fetcher saves the HTML; the
      // user clicks through to find the PDF on Europe PMC's UI.
      //
      // This is NOT a direct PDF download. The honest alternative
      // is to do an API hop: GET
      //   https://www.ebi.ac.uk/europepmc/webservices/rest/MED/{PMID}?resultType=core&format=json
      // to look up the PMCID, then construct the PMC PDF URL. But
      // that requires changes to the fetcher (native host) and
      // adds a network round-trip. Defer to v2 once the fetcher
      // supports an async "look up then download" path.
      const trimmed = finding.text.trim();
      if (!/^\d{6,9}$/.test(trimmed)) return null;
      return {
        url: `https://europepmc.org/article/MED/${trimmed}`,
        category: "citation",
        filename: `pmid-${trimmed}`,
        format: "html",
      };
    }
    case "pmcid":
      // Same as PMID: PMCID alone is not a download URL. When the
      // page also has citation_pdf_url, that's the path the
      // downloader takes (see the pdf_url case below). When the
      // page has only the PMCID and no pdf_url, the user falls back
      // to either the DOI (via doi.org) or Europe PMC (if the
      // patternId is "pmid" — see above).
      return null;
    case "biorxiv": {
      // bioRxiv PDF: publisher serves a known canonical URL
      // pattern. We trust the DOI from the page's own meta tag /
      // text body, so this branch is reachable when the bioRxiv
      // pattern emitted a text-body finding (confidence 0.7,
      // gated out) OR a high-confidence source scanner finding.
      // The high-confidence path through the meta tag uses the
      // pdf_url case below, which is the more reliable match.
      // This branch covers the case where the page is bioRxiv
      // itself with the DOI in the URL but no citation_pdf_url
      // meta tag.
      const filename = sanitizeFilename(finding.text, "doi");
      if (!filename) return null;
      return {
        url: `https://www.biorxiv.org/content/${finding.text}.full.pdf`,
        category: "citation",
        filename,
        format: "pdf",
      };
    }
    case "medrxiv": {
      // Same as bioRxiv but for medRxiv.
      const filename = sanitizeFilename(finding.text, "doi");
      if (!filename) return null;
      return {
        url: `https://www.medrxiv.org/content/${finding.text}.full.pdf`,
        category: "citation",
        filename,
        format: "pdf",
      };
    }
    case "pdf_url": {
      // The publisher put the direct PDF URL in a
      // <meta name="citation_pdf_url"> tag. This is the most
      // reliable path for PubMed Central (PMC) articles:
      //   <meta name="citation_pdf_url" content="https://pmc.ncbi.nlm.nih.gov/articles/PMC10984893/pdf/13613_2024_Article_1277.pdf">
      // We treat the URL itself as the download target. The
      // filename is derived from the URL's last path segment
      // (minus the .pdf extension) so it stays unique.
      const url = finding.text.trim();
      if (!/^https?:\/\//i.test(url)) return null;
      const lastSeg = url.split("/").pop() ?? "";
      const stem = lastSeg.replace(/\.pdf$/i, "");
      if (!stem) return null;
      return {
        url,
        category: "citation",
        filename: stem.slice(0, 200),
        format: "pdf",
      };
    }
    case "dc.identifier": {
      // Dublin Core DC.identifier can hold anything — a DOI
      // (bare or with doi: prefix or doi.org URL), an arXiv
      // ID (prefix or URL), a JSTOR stable URL, an OCLC
      // number, or just a permalink. We try the citation-style
      // forms first; anything we can't classify is rejected
      // rather than guessed. Legacy / institutional repositories
      // that predate the Highwire convention (option E from
      // the 2026-06-13 audit) use this to carry DOIs.
      const raw = finding.text.trim();
      // DOI form (doi: prefix, bare, or doi.org URL)
      const doi = raw.match(/(?:doi:\s*|doi\.org\/)?(10\.\d{4,9}\/[^?\s#]+)/i);
      if (doi) {
        const doiSlug = sanitizeFilename(doi[1]!, "doi");
        if (!doiSlug) return null;
        return {
          url: `https://doi.org/${doi[1]!}`,
          category: "citation",
          filename: doiSlug,
          format: "html",
        };
      }
      // arXiv form (URL or prefix)
      const arxiv = raw.match(
        /(?:arxiv\.org\/(?:abs|pdf)\/|arXiv:\s*)(\d{4}\.\d{4,5}(?:v\d+)?)/i
      );
      if (arxiv) {
        const filename = sanitizeFilename(arxiv[1]!, "arxiv");
        if (!filename) return null;
        return {
          url: `https://arxiv.org/pdf/${arxiv[1]!}`,
          category: "citation",
          filename,
          format: "pdf",
        };
      }
      return null;
    }
    case "github":
      // v1: not supported. Needs clone URL parsing + zip download.
      return null;
    default:
      // Science patterns (math/physics/bio/cs/chem) and any
      // future pattern that doesn't have a clear download target.
      return null;
  }
}

/** Strip characters that are unsafe in filenames or too long
 *  for typical filesystems. Returns null if the result is empty. */
function sanitizeFilename(text: string, kind: "arxiv" | "doi"): string | null {
  if (kind === "arxiv") {
    // arXiv IDs are NNNN.NNNNN with optional vN suffix. They're
    // already filesystem-safe; just trim whitespace.
    const trimmed = text.trim();
    if (!/^\d{4}\.\d{4,5}(?:v\d+)?$/.test(trimmed)) return null;
    return trimmed;
  }
  if (kind === "doi") {
    // DOIs are "10.NNNN/anything". The slash is a path separator
    // in most filesystems; we replace it with an underscore
    // (a common convention) and cap the length to avoid path
    // length limits. Anything else (control chars, NUL) is
    // stripped.
    const cleaned = text
      .replace(/[\\/<>:"|?*\x00-\x1f]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 200);
    return cleaned || null;
  }
  return null;
}

/** Group of downloadables from a set of findings, used by the
 *  bridge's /batch-download endpoint. Returns both the planned
 *  downloads and the findings that couldn't be downloaded
 *  (e.g. text-body arXiv IDs) so the caller can surface them. */
export interface BatchPlan {
  planned: Array<{ finding: Finding; info: DownloadInfo }>;
  skipped: Array<{ finding: Finding; reason: string }>;
}

export function planBatch(findings: Finding[]): BatchPlan {
  const planned: BatchPlan["planned"] = [];
  const skipped: BatchPlan["skipped"] = [];
  for (const f of findings) {
    if (f.source === "text") {
      skipped.push({
        finding: f,
        reason: "text-body match: not a certified source",
      });
      continue;
    }
    const info = getDownloadInfo(f);
    if (!info) {
      skipped.push({
        finding: f,
        reason: `pattern '${f.patternId}' not downloadable in v1`,
      });
      continue;
    }
    planned.push({ finding: f, info });
  }
  return { planned, skipped };
}
