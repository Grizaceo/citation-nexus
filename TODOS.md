# TODOS

Open work for Citation Nexus, organized by component with
priorities (P0 = blocker, P1 = next release, P2 = soon,
P3 = eventually, P4 = someday). Items at the top of each
section are higher priority.

## popup

- [x] **Refactor `popup/main.ts` (633 LOC → 6 files)** **Priority:** P1 ✓
  Split into state.ts (MSG/bridge/storage keys/TabState/state),
  render.ts (setSub/paintPopup/renderFindingRow), keywords.ts
  (toggle), embeddings.ts (opt-in + dropdown + debounced search),
  dev-tools.ts (Status/Embed/Find-similar), and a thin
  orchestrator main.ts. Shipped in 5 phases (commits
  2169c86, 240c7c4, 47c2ac1, 203ad87, 5484335) on 2026-06-13.
  No behavior change. All tests + goldset + build green at
  every commit. main.ts: 633 → 143 LOC.
- [ ] **Deduplicate text-vs-meta findings with the same ID** **Priority:** P2
  When a citation ID is found in both text body (source="text",
  confidence 0.7) and JSON-LD description (source="json-ld",
  confidence 0.95), the popup shows two rows. User can pick
  the JSON-LD one (has [Save]), but the duplicate is noisy.
  Cross-scanner dedup requires a registry-level merge pass.

## downloads

- [ ] **Real PDF download for PMID (Europe PMC API hop)** **Priority:** P2
  Current `pmid` case routes to `europepmc.org/article/MED/{PMID}`
  (HTML landing). The "real" path: GET
  `https://www.ebi.ac.uk/europepmc/webservices/rest/MED/{PMID}?resultType=core&format=json`,
  parse the `pmcid` field, then build the PMC PDF URL
  `https://www.ncbi.nlm.nih.gov/pmc/articles/{PMCID}/pdf/...`.
  Requires fetcher changes (native host) to support an async
  "look up then download" pattern.
- [ ] **GitHub repo download support** **Priority:** P3
  `github` pattern matches the repo URL but `getDownloadInfo`
  returns null. Needs clone URL parsing + zip download. Use
  `https://api.github.com/repos/{owner}/{repo}/zipball/{ref}`.
- [ ] **JSTOR / IEEE Xplore / ScienceDirect specific paths** **Priority:** P4
  Other publisher-specific download patterns. Lower priority
  because most academic PDFs are accessible via the DOI's
  `doi.org` redirect already.

## sources

- [ ] **Expand Dublin Core recognition** **Priority:** P3
  Currently only `DC.identifier` is mapped. `DC.title`,
  `DC.creator`, `DC.subject`, `DC.date` could enrich the
  finding metadata displayed in the popup tooltip. No
  download impact, only display.
- [ ] **PRISM meta tag support** **Priority:** P4
  `<meta name="prism.doi">`, `<meta name="prism.publicationName">`,
  etc. Low usage today; PubMed Central dropped PRISM in favor
  of citation_* a while back. Keep on radar for institutional
  repositories that haven't migrated.

## embeddings

- [ ] **SPECTER2 model adapter** **Priority:** P3
  v2 of `cs.model` was always meant to add SPECTER2 (English
  academic paper similarity) as a second model. The MODELS
  registry already has the placeholder (`scholar: null`).
  SPECTER2 int8 is ~110 MB — too big for the opt-in toggle
  to feel "lightweight", but it's the right model for paper-
  to-paper similarity.
- [ ] **fastText keyword vectors** **Priority:** P4
  v2 placeholder for `keywords` model. 60 MB, 157 languages.
  Word-level vectors; useful for matching by single token
  rather than full sentence. Low priority — current
  `findSimilar` works fine for the goldset.
- [ ] **Embedding result dedup at the popup level** **Priority:** P3
  `runEmbedSearch` currently shows the embedding's head
  (first 8 components) as a "did it work?" diagnostic. A
  real topK display against the pre-computed index would be
  more useful. The findSimilarAsync plumbing exists.

## build / infra

- [ ] **Bun + happy-dom test runner switch** **Priority:** P3
  The happy-dom-based test environment has occasional
  DOMException noise (`Failed to execute "fetch()"` warnings)
  when individual tests trigger network calls. Switching to
  Bun's native test runner + happy-dom-globals would
  eliminate the happy-dom fetch layer entirely.
- [ ] **VERSION + CHANGELOG + TODOS integration with CI** **Priority:** P2
  The new files (added in this commit) need a CI check that
  fails if `VERSION` and `package.json.version` diverge, and
  that the CHANGELOG has an entry for the current version.
  GHA workflow under `.github/workflows/`.

## docs / release

- [ ] **First Chrome Web Store release** **Priority:** P1
  v0.2.0 is the natural first public release on the Chrome
  Web Store. Requires: store screenshots (3 sizes), a
  privacy policy URL, a `STORE.md` with the human-readable
  description, and a submission through the Chrome Web Store
  Developer Dashboard.
- [ ] **PR/landing infrastructure via gstack-ship** **Priority:** P2
  Steps 18-20 of gstack-ship (`doc-release` subagent, PR
  creation, metrics persistence) require `gh` CLI auth and
  the `~/.gstack/projects/` setup. Currently we push direct
  to master, which is fine for a single-dev repo but blocks
  the gstack-ship PR workflow. Set up when we onboard a
  second contributor.
- [ ] **Third-party licenses attribution doc** **Priority:** P4
  License file is present (MIT) but LICENSE in repo root is
  the only copy. Add a `THIRD_PARTY_LICENSES.md` for the
  bundled WASM / ONNX runtime / transformers.js. Required
  for Chrome Web Store distribution. The
  `@huggingface/transformers` and `onnxruntime-web` packages
  ship their own LICENSE files in `node_modules/`, but a
  consolidated attribution doc makes auditing easier.

## test coverage

- [ ] **End-to-end popup test in happy-dom** **Priority:** P2
  The popup entry has no direct unit tests (the renderer is
  hard to test without a real DOM context). Add a happy-dom
  test that loads `popup/index.html` + `main.ts`, simulates
  a few messages from the background (GET_TAB_CITATIONS with
  a fixture), and asserts the rendered rows.
- [ ] **Goldset expansion: PMC and PubMed cases** **Priority:** P3
  The current goldset is curated from real arXiv and Wikipedia
  text. Add 20-30 PubMed / PMC / journal-publisher cases to
  guard against regressions when we add the real PDF
  download path.

## Completed

- [x] **6 quick-win audit cleanups** **Completed:** v0.2.0 (2026-06-13)
  Replaced `any` with `unknown` in background-handler payload;
  made `Embedder` / `LoadResult` / `ScoredItem` / `_internal`
  file-private; wired the popup to consume the MODELS
  registry dynamically.
- [x] **Math.equation volume/issue false positive fix** **Completed:** v0.2.0
  Added `before: /\d\($/` falsifier. 6 PubMed FP → 0.
- [x] **JSON-LD description walker + arXiv prefix support** **Completed:** v0.2.0
  `description` recurse + `arXiv:` prefix form in classifier.
  YouTube paper-review use case now works.
- [x] **High-confidence downloader paths: bioRxiv, medRxiv,
  PMC pdf_url, og:url, PMID via Europe PMC, Dublin Core
  DC.identifier, Schema.org microdata** **Completed:** v0.2.0
  All six (A-F) from the v1 gaps audit closed.
- [x] **Opt-in embeddings toggle in popup** **Completed:** v0.2.0
  "Use semantic search" checkbox. WASM only loads when
  user explicitly requests it.
- [x] **Pre-push audit (gstack-ship Step 16)** **Completed:** v0.2.0
  257 TS tests + 27 Python tests + goldset F1=1.000 + build clean.
- [x] **Push 9 commits to origin/master** **Completed:** v0.2.0
  c20c1c0 = HEAD, branch tracking set up.
- [x] **VERSION/CHANGELOG/TODOS scaffolding** **Completed:** v0.2.0
  4-digit semver file, gstack-style changelog with v0.2.0
  and v0.1.0 entries, and TODOS.md with priority-organized
  pending work. Awaiting CI integration in a follow-up.
