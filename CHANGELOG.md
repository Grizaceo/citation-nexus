# Changelog

All notable changes to Citation Nexus are documented here. The format
is loosely based on [Keep a Changelog](https://keepachangelog.com/), and
the version scheme follows `MAJOR.MINOR.PATCH.MICRO` (4-digit semver)
to align with the gstack-ship release workflow.

## [0.2.0.0] - 2026-06-13

The "v2" release. Closes the v1 source-detection gaps, adds the
opt-in embeddings toggle, fixes the math.equation volume/issue
false positive, and wires the downloader to bioRxiv, medRxiv,
PMC, and Europe PMC. The high-confidence source list now covers
six scanner types: meta tags (Highwire + Dublin Core), JSON-LD,
canonical link, OpenGraph, Schema.org microdata, and a generic
PDF-URL meta tag.

### Added

- **Opt-in embeddings section in the popup.** The embeddings
  panel (dropdown + search + dev tools) is hidden by default
  behind a "Use semantic search" toggle. The 22.5 MB ONNX
  runtime WASM stays bundled (one-time download) but the
  service worker no longer initializes it unless the user
  opts in.
- **High-confidence source scanners.**
  - `scanOpenGraph`: extracts DOI / arXiv from `og:url` and
    `og:see_also` (confidence 0.85).
  - `scanMicrodata`: walks `itemscope` elements with academic
    `itemtype` (ScholarlyArticle, CreativeWork, Article,
    Publication, bare), reads `itemprop` descendants with the
    spec's full attribute lookup order (`content` → `href` →
    `src` → `textContent`), confidence 0.85.
  - `scanMetaTags` now also accepts Dublin Core `DC.*` meta
    tags (legacy / institutional repositories), case-
    insensitive, with `.` normalized to `_` in the map lookup.
  - `citation_pdf_url` recognized as a `pdf_url` pattern, with
    the URL passed through to the downloader as-is.
- **Downloader support for new sources.** The downloader now
  builds URLs for:
  - `biorxiv`  → `https://www.biorxiv.org/content/{DOI}.full.pdf`
  - `medrxiv` → `https://www.medrxiv.org/content/{DOI}.full.pdf`
  - `pdf_url` → uses the meta-tag URL verbatim
  - `dc.identifier` → DOI forms go via doi.org; arXiv forms
    via arxiv.org/pdf; unrecognised values return null
  - `pmid` → `https://europepmc.org/article/MED/{PMID}` (HTML
    landing page; honest best-effort — the API-hop version is
    deferred to a later release)
- **Tests:** 257 TS tests (+57 over 0.1.0), 16 bridge tests,
  11 agent tests. Goldset F1 = 1.000 (24 patterns).

### Changed

- **JSON-LD walker** now recurses into the `description` field
  (was only `identifier` / `doi` / `sameAs` / `url`). The
  classifier recognizes the `arXiv:NNNN.NNNNN` prefix form in
  addition to `arxiv.org/abs/...` URL form. Fixes the YouTube
  video-description use case.
- **Downloader input contract clarified.** The `payload?: any`
  in `IncomingMessage` became `payload?: Record<string,
  unknown>`, with two new typed pluck helpers (`pluckString`,
  `pluckFindings`) for the consumer side. Stricter source
  gate still wins on `text`-source findings.

### Fixed

- **Math false positive on volume/issue.** `math.equation`
  matched the `(N)` parens in journal citation format like
  `JAMA Dermatol. 2023;159(2):201-209` as if they were
  equation references. Added a falsifier (`before: /\d\($/`)
  that drops the match when the open paren is preceded by a
  digit (the journal volume). Real equation references are
  preceded by whitespace, punctuation, or operators and
  survive the gate.
- **Popup type-cleanup pass.** Two dead exports from the v1
  audit (`DEFAULT_MODEL_ID`, `MessageType`) removed; the
  unused `_internal` namespace in `sources.ts` removed.
- **`FindingSource` union extended.** New sources `opengraph`
  and `microdata` recognized in the type system alongside the
  pre-existing `text` / `meta` / `json-ld` / `canonical`.

### Security

- No security-relevant changes in this release. The popup's
  embeddings opt-in toggle reduces the attack surface by
  deferring the WASM load until the user explicitly requests
  it. Source confidence gate (MIN = 0.85) keeps text-body
  matches out of the download path.

## [0.1.0] - 2026-05-23

Initial public release. v0.1.0 ships the Highwire `citation_*`
meta tag scanner, JSON-LD (identifier / doi / sameAs / url),
canonical link, and text-pattern detection for arXiv / DOI /
PubMed / GitHub / bioRxiv / medRxiv / PMC. Embeddings feature
(in-browser MiniLM via `@huggingface/transformers`) and the
downloader for arXiv + DOI URLs. 200 TS tests, 16 bridge tests,
11 agent tests. Goldset F1 = 1.000.

[Unreleased]: https://github.com/Grizaceo/citation-nexus/compare/v0.1.0...HEAD
