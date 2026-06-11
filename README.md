# Citation Nexus

Chrome extension (Manifest V3) that detects **academic citations** and
**English-language science concepts** on any web page, highlights them
for diagonal reading, and exposes an **agentic JSON API** over a local
HTTP bridge and a Chrome native messaging host.

Built end-to-end as a showcase for the **MiniMax M3** model — a single
greenfield repo that integrates a citation spotter (arXiv, DOI, PubMed,
GitHub, bioRxiv, medRxiv) with a domain-agnostic English science pattern
set (math, physics, biology, CS/ML, chemistry), plus a Python bridge and
a native host that any CLI agent (Hermes, Claude, plain `curl`) can
drive.

## What it does

On any page, the content script:

1. Walks the DOM, skipping `<script>`/`<style>`/our own wrappers.
2. Applies every registered pattern from `citations` and `science` sets.
3. Resolves overlapping matches (longest wins).
4. Wraps each match in a `<span class="nx-highlight nx-highlight-{cat}">`
   with a tooltip.
5. Pushes the findings to the background worker so the popup can show
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
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
nexus-bridge --port 3002
# or:  uvicorn nexus_bridge.server:app --port 3002
```

### Tests

```bash
npm test              # vitest: pattern set unit tests
cd bridge && pytest   # bridge API + pattern-catalog sync test
```

## Project layout

```
citation-nexus/
├── package.json
├── wxt.config.ts
├── src/
│   ├── entrypoints/
│   │   ├── background.ts        # service worker
│   │   ├── content.ts           # page scanner + highlighter
│   │   ├── popup/               # toolbar popup
│   │   └── options/             # settings page
│   ├── patterns/
│   │   ├── core.ts              # PatternDef, PatternSet, Finding
│   │   ├── registry.ts          # applyPatterns() with overlap resolution
│   │   ├── highlight.ts         # <span> wrapper + tooltip
│   │   ├── sets/
│   │   │   ├── citations.ts     # arXiv, DOI, PMID, GitHub, ...
│   │   │   └── science.ts       # math, physics, biology, cs, chemistry
│   │   └── tests/               # vitest
│   ├── bridge/
│   │   ├── client.ts            # extension → HTTP bridge
│   │   └── protocol.md
│   ├── cli/
│   │   └── scan.ts              # batch scanner (used by goldset)
│   └── assets/
│       └── content.css          # highlight theme
├── bridge/
│   ├── pyproject.toml
│   ├── nexus_bridge/server.py
│   └── tests/test_bridge.py
├── agent/
│   ├── native_host.py
│   ├── manifest.json
│   └── README.md
├── goldset/
│   ├── README.md
│   ├── data/
│   │   ├── citations.jsonl      # 9 patterns × ~17 examples
│   │   └── science.jsonl        # 15 patterns × ~17 examples
│   ├── scripts/eval_goldset.py  # P/R/F1 eval + CI gate
│   └── reports/latest.md        # last eval output
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PATTERNS.md
│   └── AGENT.md
├── demo/demo.html
└── .github/workflows/ci.yml
```

## Goldset evaluation

The `goldset/` directory holds ~430 hand-curated examples (positive and
negative) across 24 patterns. The eval script (`goldset/scripts/eval_goldset.py`)
spawns the TS registry once per file, scores TP/FP/FN/TN, computes P/R/F1
per pattern, and gates the build on macro F1 ≥ 0.85. Latest run:

| Metric | Score |
|---|---:|
| Macro precision | 0.996 |
| Macro recall | 0.985 |
| **Macro F1** | **0.989** |
| Micro F1 | 0.989 |
| Patterns at F1=1.00 | 21 / 24 |

See `goldset/reports/latest.md` for the full per-pattern table and failure
samples. To run locally:

```bash
npm ci
python3 goldset/scripts/eval_goldset.py
```
```

## Why this exists

A clean slate that demonstrates three things together:

- **Diagonal reading**: high-precision highlights per scientific category
  with tooltips, not just blue underlines.
- **Citation import**: pop a page, see every arXiv/DOI/PMID in the popup,
  one-click import to a local vault.
- **Agent-native**: any CLI agent can scan, list, and import without
  the browser. The native host makes the extension itself scriptable.

## License

MIT
