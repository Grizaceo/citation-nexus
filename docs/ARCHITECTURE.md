# Citation Nexus — Architecture

A Chrome extension (Manifest V3) plus a local HTTP bridge and a native
messaging host. The extension works fully without the bridge; the bridge
exists to expose the same data over a CLI-friendly JSON API.

## Components

```
+-------------------------+        +---------------------+
|  Content script (page)  |  msg   |  Background worker  |
|  - applyPatterns()      | -----> |  - tab state        |
|  - renderHighlights()   |        |  - bridge forward   |
+-------------------------+        +---------------------+
                                          |
                              chrome.runtime.sendNativeMessage
                                          |
                                          v
                                +---------------------+
                                |  native_host.py     |
                                |  (stdin/stdout)     |
                                +---------------------+
                                          |
                                          v
                                +---------------------+
                                |  HTTP bridge        |
                                |  127.0.0.1:3002     |
                                |  FastAPI            |
                                +---------------------+
                                          |
                                          v
                                +---------------------+
                                |  Vault              |
                                |  imports/<cat>/...  |
                                +---------------------+
```

### Content script (`src/entrypoints/content.ts`)

- Walks the DOM, calls `applyPatterns(root, registry)`, then
  `renderHighlights(findings)`.
- Sends a `CITATIONS_UPDATE` message with the (already-deduplicated)
  findings to the background worker.

### Background worker (`src/entrypoints/background.ts`)

- Owns the in-memory per-tab state. Stores the most recent scan so the
  popup can show counts without re-scanning.
- Exposes `GET_TAB_CITATIONS` for the popup and `IMPORT_BRIDGE` which
  forwards to the local HTTP bridge.

### Pattern registry (`src/patterns/`)

- `core.ts` — types (`PatternDef`, `PatternSet`, `Finding`).
- `registry.ts` — `applyPatterns(root, registry)` does the DOM walk and
  match resolution. Overlaps are dropped by `start` ascending and
  `(end - start)` descending.
- `highlight.ts` — wraps each Finding in a `<span class="nx-highlight
  nx-highlight-{category}">` and attaches a tooltip.
- `sets/citations.ts` — arXiv, DOI, PMID, PMC, GitHub, bioRxiv, medRxiv.
- `sets/science.ts` — math, physics, biology, CS, chemistry (English).

### Popup (`src/entrypoints/popup/`)

- Renders the active tab's findings as category chips.
- Rescan / Options buttons.

### Options (`src/entrypoints/options/`)

- Toggle which pattern sets run.
- Configure the local bridge URL.

### Bridge (`bridge/nexus_bridge/server.py`)

- FastAPI, 127.0.0.1:3002 by default.
- `/import` writes a Markdown file to the local vault under
  `imports/<category>/`.
- `/patterns` returns the catalog mirrored from the TS side; a test
  (`test_pattern_sets_match_ts`) verifies the two stay in sync.

### Native messaging host (`agent/native_host.py`)

- Small Python binary that Chrome spawns on `sendNativeMessage`.
- Speaks Chrome's length-prefixed JSON framing.
- Forwards `action: import|patterns|health` to the bridge.

## Privacy

- All pattern matching happens in the page context (the content script).
- The bridge is loopback-only; no remote network exposure.
- The only external HTTP calls are to arXiv/CrossRef/EuropePMC APIs when
  downloading metadata, and those are opt-in per action.

## Permissions

- `storage`, `activeTab`, `clipboardWrite`, `scripting`, `downloads`,
  `nativeMessaging`.
- Host permissions: arxiv.org, eutils.ncbi.nlm.nih.gov, api.github.com,
  api.crossref.org, europepmc, biorxiv API, plus `127.0.0.1:3002`.
