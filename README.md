# Citation Nexus

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Goldset F1](https://img.shields.io/badge/goldset_F1-1.000-brightgreen)](goldset/reports/latest.md)
[![Tests](https://img.shields.io/badge/tests-88_passing-brightgreen)](#tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](src)

Chrome extension (Manifest V3) that detects **academic citations** and
**English-language science concepts** on any web page, highlights them
for **diagonal reading**, and exposes an **agentic JSON API** over a local
HTTP bridge and a Chrome native messaging host.

A single greenfield repo that integrates a citation spotter (arXiv, DOI,
PubMed, GitHub, bioRxiv, medRxiv) with a domain-agnostic English science
pattern set (math, physics, biology, CS/ML, chemistry), plus a Python
bridge and a native host that any CLI agent (Hermes, Claude, plain
`curl`) can drive.

## What it does

On any page, the content script:

1. Walks the DOM, skipping `<script>`/`<style>`/our own wrappers.
2. Applies every registered pattern from `citations` and `science` sets.
3. Resolves overlapping matches (longest-wins, then higher-priority).
4. Wraps each match in `<span class="nx-highlight nx-highlight-{cat}">`
   with a tooltip.
5. **Sentence-aware** — any sentence that contains at least one match
   is also wrapped in `<mark class="nx-sentence">` with a subtle
   background, so diagonal readers can scan whole relevant blocks.
6. Pushes the findings to the background worker so the popup can show
   counts per category without re-scanning.

Hover any highlighted span → tooltip with the pattern label. Open the
popup → category chips, raw findings list, rescan/options buttons.

## Pattern sets

| Set id      | Categories                | Examples                              |
|-------------|---------------------------|---------------------------------------|
| `citations` | citation                  | `arXiv:2401.01234`, `10.1038/...`, `PMID: 33445566`, `github.com/o/r` |
| `science`   | math, physics, biology, cs, chemistry | `Theorem 1.2`, `Z boson`, `TP53`, `Llama-3`, `H2O` |

See [`docs/PATTERNS.md`](docs/PATTERNS.md) for the catalog and the
recipe to add a new pattern or set.

## Agentic — three ways to drive it

1. **HTTP bridge** (recommended, no Chrome required)

   ```bash
   curl -s http://127.0.0.1:3002/health
   curl -s -X POST http://127.0.0.1:3002/import \
     -H "Content-Type: application/json" \
     -d '{"category":"citation","patternId":"arxiv.id","text":"arXiv:2401.01234"}'
   ```

2. **Native messaging host** — Chrome calls a small Python binary
   (`agent/native_host.py`) that forwards to the bridge. See
   [`agent/README.md`](agent/README.md).

3. **CDP / kimi-webbridge** — control Chrome from a CLI agent and *see*
   the popup. See [`docs/AGENT.md`](docs/AGENT.md).

## Quick start

### Extension

```bash
npm install
npm run build        # → .output/chrome-mv3
```

Then in Chrome: `chrome://extensions` → enable Developer mode → "Load
unpacked" → select `.output/chrome-mv3`. Open
[`demo/demo.html`](demo/demo.html) to see the highlighter on a curated
sample.

### Bridge

```bash
cd bridge
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
nexus-bridge --port 3002
# or:  uvicorn nexus_bridge.server:app --port 3002
```

### Tests

```bash
npm test              # vitest: 71 unit + integration tests
cd bridge && pytest   # bridge API + protocol tests (10)
cd ../agent && python3 -m pytest tests/   # native host tests (7)
```

CI runs 4 jobs in parallel: `typescript`, `bridge`, `goldset`, `native-host`.
MIT
