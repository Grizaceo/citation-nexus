// Citation Nexus — Download URL resolver
//
// Given a Finding (patternId + text), returns a URL the user can open
// in a new tab to download or read the cited resource. Returns null
// when no direct-download URL is known for that pattern type.
//
// The patternId decides the URL shape; the finding's `text` is the
// captured group, which is already the bare identifier (e.g. the
// arXiv ID, the DOI) rather than the full match — see the registry's
// `applyPatternsToText` for the exact captured-vs-full rule.

import type { Finding } from "@/patterns/core";

export function getDownloadUrl(finding: Finding): string | null {
  switch (finding.patternId) {
    case "arxiv.id":
    case "arxiv.abs":
      // arXiv: captured group is the bare ID like "2605.22166" or
      // "2605.22166v1". The PDF URL is direct.
      return `https://arxiv.org/pdf/${finding.text}`;

    case "doi":
    case "doi.url":
      // doi.org is the official resolver. It 302s to the publisher,
      // which usually exposes a PDF. Not perfect (some publishers
      // require institutional access) but it's the right *link*.
      return `https://doi.org/${finding.text}`;

    case "github":
      // Could be a clone URL but that requires parsing owner/repo
      // and choosing a ref. Not worth a guess — return null and
      // let the user click the link in the page.
      return null;

    case "pmid":
    case "pmcid":
      // PubMed has no direct PDF. Europe PMC hosts many but not
      // all. Skip for v1.
      return null;

    case "biorxiv":
    case "medrxiv":
      // bioRxiv PDF URLs follow a pattern but require the full
      // DOI/version. Out of scope for v1.
      return null;

    default:
      return null;
  }
}

/** Human label for the download action — used in tooltips. */
export function getDownloadLabel(finding: Finding): string | null {
  switch (finding.patternId) {
    case "arxiv.id":
    case "arxiv.abs":
      return "Open PDF on arXiv";
    case "doi":
    case "doi.url":
      return "Resolve on doi.org";
    default:
      return null;
  }
}
