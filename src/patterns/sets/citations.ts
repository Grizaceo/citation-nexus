// Citation Nexus — Citation Pattern Set
// Detects academic citations: arXiv, DOI, PubMed, GitHub, PMC, bioRxiv, medRxiv.

import type { PatternSet } from "../core";

export const citationsSet: PatternSet = {
  id: "citations",
  name: "Citations",
  description: "Academic and code citations: arXiv, DOI, PMID, GitHub, PMC, preprints.",
  patterns: [
    {
      id: "arxiv.id",
      label: "arXiv ID",
      category: "citation",
      regex: "(?:arXiv:|(?<![\\w/]))(\\d{4}\\.\\d{4,5}(?:v\\d+)?)\\b",
      flags: "gi",
      tooltip: "arXiv preprint",
    },
    {
      id: "arxiv.abs",
      label: "arXiv abstract URL",
      category: "citation",
      regex: "arxiv\\.org/(?:abs|pdf)/(\\d{4}\\.\\d{4,5}(?:v\\d+)?)",
      flags: "gi",
      tooltip: "arXiv link",
    },
    {
      id: "doi",
      label: "DOI",
      category: "citation",
      regex: "\\b10\\.\\d{4,9}/[-._;()/:A-Z0-9]+\\b",
      flags: "gi",
      tooltip: "Digital Object Identifier",
    },
    {
      id: "doi.url",
      label: "doi.org URL",
      category: "citation",
      regex: "doi\\.org/(10\\.\\d{4,9}/[^\\s\"'<>]+)",
      flags: "gi",
      tooltip: "DOI link",
    },
    {
      id: "pmid",
      label: "PubMed ID",
      category: "citation",
      regex: "(?:PMID:?\\s*|pubmed\\.ncbi\\.nlm\\.nih\\.gov/)(\\d{6,9})",
      flags: "gi",
      tooltip: "PubMed reference",
    },
    {
      id: "pmcid",
      label: "PMC ID",
      category: "citation",
      regex: "(?:\\b|(?:pmc\\.ncbi\\.nlm\\.nih\\.gov/articles/))(PMC\\d{4,8})",
      flags: "gi",
      tooltip: "PubMed Central",
    },
    {
      id: "github",
      label: "GitHub repo",
      category: "citation",
      regex: "(https?://github\\.com/[A-Za-z0-9][A-Za-z0-9._-]+/[A-Za-z0-9._-]+?)(?:\\.git)?(?=\\s|[#/?]|$)",
      flags: "gi",
      tooltip: "GitHub repository",
    },
    {
      id: "biorxiv",
      label: "bioRxiv",
      category: "citation",
      regex: "(?:biorxiv\\.org/content/)(10\\.\\d{4,9}/[-._;()/:A-Z0-9]+)",
      flags: "gi",
      tooltip: "bioRxiv preprint",
    },
    {
      id: "medrxiv",
      label: "medRxiv",
      category: "citation",
      regex: "(?:medrxiv\\.org/content/)(10\\.\\d{4,9}/[-._;()/:A-Z0-9]+)",
      flags: "gi",
      tooltip: "medRxiv preprint",
    },
  ],
};
