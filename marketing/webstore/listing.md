# Chrome Web Store listing — Citation Nexus

Drafted for first submission. All copy follows the project's
voice: terse, honest, builder-talks-to-builder, no AI-writing
tropes. Character counts shown in brackets for the constrained
fields.

## Short description (132 chars max)

```
Highlight arXiv, DOI, PubMed, GitHub, and 60+ science concepts on any page. Diagonal-read with sentence blocks.
```

Char count: 114 / 132. Fits.

## Detailed description

Citation Nexus finds academic citations and English-language
science concepts on any web page and lights them up so you can
read the page in sentence-level blocks instead of hunting for
keywords.

**What it highlights**

Citations: arXiv IDs, DOIs, PubMed IDs, GitHub repos.
Science concepts: theorems, definitions, particles, chemical
formulas, gene symbols, ML model names, dataset names (math,
physics, biology, CS, chemistry). 24 pattern types in total.
The full catalog: https://github.com/Grizaceo/citation-nexus#patterns

**How it looks**

Each category gets its own color. The matched span is bold.
The whole sentence containing a match gets a subtle background
block. The block is the unit — you scan for blocks, not
individual words. Toggle the keyword highlight spans off in
the popup if you only want the sentence blocks.

**The popup**

Click the icon. You see total findings, per-category counts,
and the per-finding list. Per finding: [Copy] the citation
text to clipboard, [Open] the source URL in a new tab, [Save]
to download a high-confidence PDF to your local vault.

**Pause toggle**

The popup has a Pause/Resume button that stops the content
script from scanning. State is shared across all open tabs
and survives Chrome restarts.

**Optional: semantic search**

Opt-in only. Default OFF — the embeddings feature downloads
~22 MB of ONNX runtime + model weights from huggingface.co
on first use. Once enabled, you can search the pre-computed
keyword index for "papers that mention Llama-3" or similar.
This is gated behind an explicit checkbox in the popup.
The downloads happen in the background service worker; if
you never enable it, no WASM is ever fetched.

**Why the native messaging permission?**

Citation Nexus ships a local Python "bridge" so any CLI tool
(curl, httpx, Claude, Hermes, plain scripts) can scan URLs
and import findings to a local vault without opening a
browser. The bridge runs on 127.0.0.1:3002 and uses
chrome.runtime.sendNativeMessage for extension-originated
actions. It is fully local — no data ever leaves your
machine. The native host installer is one Python script; the
extension can install it from the Options page.

**Data and privacy**

- No analytics, no telemetry, no third-party tracking
- The extension reads page content via content scripts
  (Manifest V3 standard)
- The extension writes to chrome.storage.local for settings
  (pause state, keyword toggle, embeddings opt-in)
- The extension writes to your local filesystem only when you
  click [Save] on a high-confidence finding
- The extension contacts huggingface.co and cdn.jsdelivr.net
  only when the embeddings feature is enabled (opt-in)
- Full privacy policy: https://github.com/Grizaceo/citation-nexus/blob/main/PRIVACY.md

**Open source**

MIT licensed. Source, tests, and the eval harness live at
https://github.com/Grizaceo/citation-nexus. The ~360-case
goldset (F1=1.000 on the current 24 patterns — 124
citation cases + 232 science cases, hand-curated positives
and lookalike negatives) is in the repo — if you find a
publisher that breaks a pattern, open an issue with the
goldset diff.

## Category

Primary: **Productivity**
Secondary: **Developer Tools**

Productivity because the core value is reading research
papers faster. Developer Tools because of the CLI / agent
bridge — it turns the extension into a programmatic API.

## Language

English only. The pattern set is English-language science
concepts (Latin taxonomic names, English theorem statements,
English ML conventions). Internationalization is not on the
v0.2 roadmap.

## Single-purpose description (required for Manifest V3 review)

```
Citation Nexus scans the active page for academic citations
(arXiv, DOI, PubMed, GitHub) and 60+ English-language
science concepts, and highlights them in sentence-level
blocks for diagonal reading. Findings are exported via an
optional local Python bridge for CLI and agent use.
```

## Permission justifications (for the review form)

See `permission-justifications.md` in this directory.

## Submission assets needed

- [ ] **Icons** (16, 32, 48, 128 px PNG) — see `icon-spec.md`
- [ ] **Screenshots** (1280×800 or 640×400, 1-5) — see
  `screenshot-spec.md`
- [ ] **Promo tile small** (440×280)
- [ ] **Marquee promo** (1400×560, optional)

## Author / support

- Developer: Grizaceo
- Support email: [FILL IN before submit]
- Homepage: https://github.com/Grizaceo/citation-nexus
- Privacy policy: https://github.com/Grizaceo/citation-nexus/blob/main/PRIVACY.md
