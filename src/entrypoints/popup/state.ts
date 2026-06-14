// Citation Nexus — popup state module
//
// Shared, cross-module popup state. Holds:
//   - MSG: chrome.runtime message-type constants
//   - bridge: thin RuntimeBridge wrapper (popup → background)
//   - Storage keys: chrome.storage.local keys shared with the
//     content script and DevTools (see the matching listeners
//     in main.ts)
//   - TabState: shape returned by GET_TAB_CITATIONS
//   - state: mutable runtime state shared between the orchestrator
//     (main.ts) and the section renderers (render.ts, keywords.ts,
//     embeddings.ts, dev-tools.ts). Read freely; write through
//     `state.X = ...`.
//
// The cross-section mutable state lives here so individual
// sections don't need their own getters/setters. Section-local
// state (showKeywords, embeddingsEnabled, isPaused, searchHandle)
// stays in its owning module — the refactor is not a global
// state consolidation, it's a file split.

import type { RuntimeBridge } from "@/lib/embeddings/dev_tools";
import type { Finding } from "@/patterns/core";

export const MSG = {
  GET_TAB_CITATIONS: "GET_TAB_CITATIONS",
  REQUEST_SCAN: "REQUEST_SCAN",
  COPY_FINDING: "COPY_FINDING",
  DOWNLOAD_PAPER: "DOWNLOAD_PAPER",
  EMBED_FIND_SIMILAR: "EMBED_FIND_SIMILAR",
};

// The popup → background message bridge. The dev_tools helpers
// accept any RuntimeBridge-shaped object, so this is a thin wrapper.
export const bridge: RuntimeBridge = {
  sendMessage: (msg) => chrome.runtime.sendMessage(msg),
};

// Persisted in chrome.storage.local. The content script reads the
// same key before each scan and listens for changes. Toggling
// here takes effect within ~1s on every active tab.
export const PAUSED_KEY = "nx.paused.v1";
// When true, the per-category keyword highlight spans are emitted
// in the page (the bright colorful boxes). Default false: only
// the subtle sentence wrapper renders, so diagonal reading
// stays clean. Citation IDs still appear in the popup; the
// [Download PDF] action still works — the keyword is just not
// visually highlighted.
export const KEYWORDS_KEY = "nx.keywords.v1";
// Opt-in flag for the embeddings section. Default OFF — most users
// just want the in-page highlights, and the embeddings feature
// loads ~22.5 MB of ONNX runtime WASM into the service worker the
// first time they pick a model. The flag only controls the
// popup's visibility; the bundled WASM is always shipped (see
// wxt-plugins/transformers-wasm.ts). When the user disables this
// flag the embeddings section is hidden and the dropdown is reset
// to "off" so a future opt-in starts clean.
export const EMBEDDINGS_ENABLED_KEY = "nx.embeddings.enabled.v1";

export interface TabState {
  url: string;
  title: string;
  findings: Finding[];
  scannedAt: number;
}

// Cooldown for the auto-rescan. If the popup opens and finds an
// empty state (background service worker was suspended and the
// in-memory tabStates was wiped, or the content script never
// scanned), trigger a re-scan. The cooldown prevents an infinite
// loop on pages that genuinely have 0 findings.
export const AUTO_RESCAN_COOLDOWN_MS = 30_000;

// Mutable runtime state shared across the popup's sections.
// One object (not bare let exports) so cross-module writes
// compile: `import { state } from "./state"; state.X = ...`.
export const state = {
  currentTabId: undefined as number | undefined,
  // Used by render.ts to skip the heavy DOM rebuild when the
  // count hasn't changed (avoid losing focus / scroll on a
  // noisy poll). Bypassed to -1 to force a refresh.
  lastFindingsCount: -1 as number,
  pollHandle: undefined as number | undefined,
  lastAutoRescanAt: 0 as number,
};
