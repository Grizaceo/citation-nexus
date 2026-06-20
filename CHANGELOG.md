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

## [Unreleased]

## [0.2.0.1] - 2026-06-20

Closes the medRxiv / bioRxiv collection-page scanner gap, ships the
popup dedup feature (`× N` badge for repeated findings), and adds
arXiv-version-suffix stripping so the meta-tag capture (no version)
and the text-body capture (with `vN`) collapse to one dedup group.

### Added

- **Anchor-href scanner (`scanAnchorHrefs`).** New high-recall
  source that walks every `<a href>` and `<link href>` on the page
  and emits a finding for every URL containing a recognizable
  citation identifier (arxiv.org / biorxiv.org / medrxiv.org /
  doi.org / pubmed.ncbi.nlm.nih.gov / ncbi.nlm.nih.gov/pmc). The
  motivating use case: a medRxiv or bioRxiv **collection page**
  (e.g. `https://www.medrxiv.org/collection/respiratory-medicine`)
  lists 50+ papers where each paper title is a link whose `href`
  is `https://www.medrxiv.org/content/10.64898/...v1`. The body
  text contains titles but never the URLs; the URLs are only in
  the anchor's `href` attribute. Before this scanner, a
  collection page produced 0 findings — a real usability gap
  discovered during dogfooding on 2026-06-13.
  - New `FindingSource = "anchor"` with confidence 0.6
    (strictly below text body at 0.7, so the prose version of
    a paper always wins as the dedup representative). Below the
    0.85 download threshold, so anchor findings never trigger a
    [Save] click — they're "show in popup" only.
  - Identical hrefs within a single page are deduplicated
    (medRxiv repeats the same href in the title link and the
    "PDF" link, so the page-level dedup is required for clean
    output).
  - 9 new unit tests in `src/patterns/tests/sources.test.ts`:
    arxiv / medrxiv / biorxiv / doi.org / pubmed / pmcid hrefs,
    identical-href dedup, generic non-citation anchor rejection,
    missing-href handling, and shadow-root limitation.
- **Popup finding dedup.** When a paper is cited multiple times on
  the same page (abstract + intro + bibliography) the scanner
  produced N rows with N identical "Open" buttons pointing at the
  same URL. `src/lib/dedupe.ts` groups findings by
  (category, normalizedText), with the highest source+confidence
  rank as the representative and the rest as suppressed mentions.
  paintPopup renders one row per group with a `× N` badge when
  N > 1 and the stat label "X unique · Y mentions" when Y > X.
  11 unit tests cover the edge cases.

### Fixed

- **arXiv v-suffix dedup mismatch.** On an arXiv abstract page,
  the `citation_arxiv_id` meta tag has the bare ID
  (`2401.01234`) while text-body matches include the version
  (`2401.01234v3`). The two produce separate dedup groups, so
  the popup shows 2 rows for the same paper. The
  `dedupe.normalize()` function now strips a trailing
  `\d+v\d+$` so they collapse. Strip is gated on the preceding
  character being a digit (arXiv IDs always end in a digit
  before the version), which makes it safe for words like
  `lev1` / `rev2` that happen to end in `v<digit>`. DOIs /
  PMIDs / GitHub URLs don't use the `v<digits>` suffix, so the
  strip is a no-op on them. New unit test in
  `src/lib/dedupe.test.ts` pins the contract.

### Security

- No security-relevant changes. The new scanner is read-only
  (extracts identifiers from `href` attributes, never writes
  anywhere) and emits the same shape as the existing source
  scanners.

[Unreleased]: https://github.com/Grizaceo/citation-nexus/compare/v0.2.0.1...HEAD
[0.2.0.1]: https://github.com/Grizaceo/citation-nexus/compare/v0.2.0.0...v0.2.0.1
[0.2.0.0]: https://github.com/Grizaceo/citation-nexus/compare/v0.1.0...v0.2.0.0
[0.1.0]: https://github.com/Grizaceo/citation-nexus/releases/tag/v0.1.0
