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
- **Embeddings section is opt-in**: hidden by default behind a
  "Use semantic search" checkbox in the actions row. When
  unchecked, the section is `display:none` and the service
  worker is never asked to load the ONNX runtime WASM (22.5 MB).
  The bundled WASM is still shipped with the extension (see
  `wxt-plugins/transformers-wasm.ts`); the opt-in only gates the
  runtime load + service-worker memory cost. The persisted
  flag is `nx.embeddings.enabled.v1` in `chrome.storage.local`.

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
- The `download` action is handled IN the host (no bridge hop):
  fetches the URL, writes the response body to the local vault
  at `papers/<category>/<filename>.<format>`. Returns the saved
  path + size + content-type. Idempotent: skips an existing
  file > 1KB so re-runs don't re-download.

### Native client (`src/lib/native-client.ts`)

- TypeScript wrapper around `chrome.runtime.sendNativeMessage` with the
  registered host name (`com.nexus.host`).
- Exposes `nativeHealth()`, `nativeImport(req)`, `nativePatterns()`.
- The extension's background worker (`src/lib/background-handler.ts`)
  routes two new MSG types via the deps-injected `sendNativeMessage`:
  `NATIVE_HEALTH` and `NATIVE_IMPORT`. This path is the same shape as
  the HTTP bridge path, just over a different transport.
- The host is useful when an agent wants the message to *originate from*
  the extension itself, or as a fallback when the bridge HTTP server
  is not running.

## Privacy

- All pattern matching happens in the page context (the content script).
- The bridge is loopback-only; no remote network exposure.
- The native host only forwards to the same loopback bridge.
- The extension never makes external HTTP calls on its own.

## Permissions

- `storage`, `activeTab`, `clipboardWrite`, `scripting`, `nativeMessaging`.
- Host permissions: `127.0.0.1:3002/*` and `localhost:3002/*` (the local
  bridge only). All other API hosts were dropped — the extension never
  makes remote HTTP calls.

## Local file download

Two paths converge on the same vault layout:

```
~/.local/share/nexus/vault/
├── imports/                          # metadata markdown (existing)
│   └── citation/2401.01234.md
└── papers/                           # actual downloaded files (new)
    ├── citation/2401.01234.pdf
    └── doi/10.1038_nature12373.pdf
```

- **Via the popup:** the [Save] button on a finding sends
  `DOWNLOAD_PAPER` to the background, which calls the native
  host's `download` action. Only high-confidence findings
  (`source !== 'text'`, i.e. meta tag / JSON-LD / canonical
  link) get the [Save] button — that's the "solo en las
  certificadas" rule. Text-body matches in random prose
  never trigger a save.
- **Via the bridge:** `POST /download` with a `{ url, category,
  filename, format }` body. Same vault, same write path.
  `POST /batch-download` for many in one call.

The downloader module (`src/patterns/downloader.ts`) is the
single source of truth for which patterns are downloadable
and what their vault filenames look like. Both paths consume
its `getDownloadInfo(finding)` output.
