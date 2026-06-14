# Privacy policy

Citation Nexus does not collect, transmit, sell, or share user
data with any third party.

This page exists because the Chrome Web Store review requires
a privacy policy URL, and because the extension declares
permissions that warrant a public explanation.

## What the extension sees

- The content of the active web page, while the extension
  is installed and the user has not paused it. The content
  script reads meta tags, JSON-LD blocks, Schema.org
  microdata, Dublin Core tags, and text-body matches. This
  processing happens entirely in the browser.
- The URL of the active tab, when the user clicks the
  extension icon (to show the popup for that tab). This is
  the standard `activeTab` behavior; the URL is not stored
  or transmitted.

## What the extension writes

- Settings to `chrome.storage.local` on the user's device:
  - Pause state (whether the content script is scanning)
  - Keyword highlight toggle
  - Embeddings opt-in flag
  - Last-known findings for the active tab (cache for the
    popup)
- Files to the user's local filesystem, **only** when the
  user clicks the [Save] button on a high-confidence
  finding. The destination is the local vault directory
  configured in the bridge. No file is ever written without
  an explicit user click.

## Network requests the extension makes

The extension makes outbound network requests **only** in
the following cases:

1. **When the user clicks [Save] on a finding.** The bridge
   fetches the PDF from the URL the citation points to
   (e.g. `arxiv.org/pdf/...`, `europepmc.org/...`). The
   destination is a third-party publisher; what they collect
   is governed by their own privacy policies.

2. **When the user explicitly enables the embeddings feature
   in the popup.** One-time model file downloads from
   `huggingface.co` and `cdn.jsdelivr.net` happen when the
   user picks a model. The browser caches the files locally
   after first load. No analytics, no API calls to those
   domains after the initial fetch.

3. **When the user clicks [Find similar] in the dev tools
   section.** A POST to the local bridge on
   `127.0.0.1:3002`. Loopback only.

The extension itself never sends page content or user data
to a remote server.

## Telemetry

There is no telemetry, no analytics, no crash reporting, no
usage tracking. The extension does not phone home.

## Third-party services

The extension uses three runtime dependencies; none of them
receive user data:

- `@huggingface/transformers` (Apache 2.0) — the ONNX
  embedding model runtime. Runs entirely in the browser
  service worker.
- The native messaging host Python script (MIT) — runs
  locally. Talks to the extension over Chrome's native
  messaging channel and to the local bridge on
  `127.0.0.1:3002`.
- The local bridge (MIT) — runs on `127.0.0.1:3002`. Does
  not bind to external interfaces.

## What the extension does NOT do

- It does not track browsing history.
- It does not collect page content for any purpose other
  than the in-browser scan that drives the popup.
- It does not contact any server other than the four
  host permissions in the manifest
  (`127.0.0.1:3002`, `localhost:3002`, `huggingface.co`,
  `cdn.jsdelivr.net`).
- It does not read clipboard, history, bookmarks, or any
  storage outside `chrome.storage.local`.
- It does not modify page content other than the visual
  highlight spans the user opted into.

## Children's privacy

The extension does not target children and does not
knowingly collect data from anyone. The single-purpose
function (highlighting academic citations and science
concepts) is general-audience, not directed at minors.

## Changes to this policy

Material changes will be committed to the public repository
with a clear changelog entry. The current version is pinned
to the `v0.2.0.0` release.

## Contact

For privacy questions or requests: [FILL IN before
submitting the Chrome Web Store listing].

Repository: https://github.com/Grizaceo/citation-nexus
