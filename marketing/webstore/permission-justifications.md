# Chrome Web Store — permission justifications

Chrome's Manifest V3 review asks for a one-sentence justification
per declared permission. This file gives the verbatim text to
paste into each field, plus the reason behind each choice
(for the audit trail).

## Permissions

### `storage`

Read/write the extension's own settings: pause state, keyword
toggle, embeddings opt-in flag, and the cached findings for the
active tab. Stored in chrome.storage.local only — never
synced, never shared, never transmitted.

### `activeTab`

Inject the content script into the active tab when the user
clicks the extension icon. Required to scan the page and show
the popup's per-finding list. We do not access the tab's URL
or content unless the user invokes the extension.

### `clipboardWrite`

The popup's [Copy] button writes the matched citation text to
the system clipboard. One action per click, no background
clipboard writes, no read access.

### `scripting`

Programmatically inject the content script into newly
re-loaded tabs (so the scanner is live the moment the page
finishes loading, not only after the icon is clicked). Also
used to trigger a re-scan on demand from the popup's [Rescan]
button.

### `nativeMessaging`

Required for the local Python "bridge" component. The bridge
runs on 127.0.0.1:3002 and exposes a small JSON API so any
CLI tool (curl, httpx, Hermes, Claude, plain scripts) can
trigger a scan, list findings, and import citation metadata
to a local vault. The bridge is opt-in: it is not installed
by the extension, and the user runs the one-line installer
explicitly from the Options page. Without nativeMessaging
the extension cannot dispatch save-to-vault actions to the
bridge.

## Host permissions

### `http://127.0.0.1:3002/*` and `http://localhost:3002/*`

The local bridge. Used by the extension's "Save to local
vault" action and by the embeddings section's "Find similar"
end-to-end test. Loopback only — no external traffic.

### `https://huggingface.co/*`

The embeddings feature is opt-in. When the user enables it
and picks a model, the service worker fetches the ONNX model
weights from the Hugging Face CDN. Hugging Face hosts the
official @huggingface/transformers model registry. Without
this host permission, the feature cannot lazy-load model
files. The traffic is one-time per model (the browser caches
the files locally after first load).

### `https://cdn.jsdelivr.net/*`

The embeddings feature is opt-in. When enabled, the service
worker fetches the @huggingface/transformers library's WASM
runtime from the official JSDelivr mirror (one-time, browser
caches it). This is the same artifact the library fetches by
default; the extension just pins the source so the user can
audit it.

## Why we are NOT using `*://*/*`

The extension does not need to fetch arbitrary user content.
Host permissions are scoped to the four endpoints above.
This is the minimum the feature set requires.

## Why we are NOT using remote code

The extension bundles its own JavaScript. The only runtime
dependency loaded at execution time is the @huggingface/
transformers library's WASM, which is fetched (cached) from
JSDelivr only when the user enables the embeddings feature.
This is a documented exception for transformers.js and is
the only allowed remote code path.

## Single-purpose statement (required field)

```
Citation Nexus scans the active page for academic citations
and 60+ English-language science concepts and highlights
them in sentence-level blocks for diagonal reading.
```

## Data use disclosure (required field)

The extension does not collect, transmit, sell, or share
user data with any third party. All scan results stay in
chrome.storage.local on the user's device. The local Python
bridge runs on 127.0.0.1 and only the user can call it.
The only outbound network requests are (a) one-time model
file downloads from huggingface.co and cdn.jsdelivr.net,
which happen only when the user explicitly enables the
opt-in embeddings feature, and (b) the user's own [Save]
action which fetches a PDF from the URL the citation points
to (e.g. arxiv.org/pdf/..., europepmc.org, etc.).

## Certification

I certify that the only use of the data and permissions
declared above is the functionality disclosed in the
single-purpose statement and the store listing. The extension
does not perform any function not described in the listing.
