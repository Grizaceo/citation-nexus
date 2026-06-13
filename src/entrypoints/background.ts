// Citation Nexus — Background Service Worker
// Owns tab state, popup ↔ content messaging, and bridge to local HTTP server.

import type { Finding } from "@/patterns/core";
import { handleMessage, MSG } from "@/lib/background-handler";

export default defineBackground(() => {
  const tabStates = new Map<number, import("@/lib/background-handler").TabState>();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const deps = {
      tabStates,
      fetch: globalThis.fetch.bind(globalThis),
      clipboard: navigator.clipboard,
      executeScript: (tabId: number, files: string[]) =>
        chrome.scripting.executeScript({ target: { tabId }, files }),
      sendNativeMessage: (
        application: string,
        message: any,
        callback: (response: unknown) => void
      ) => chrome.runtime.sendNativeMessage(application, message, callback),
      // NOTE: loadEmbeddingModel and embedText are NOT wired
      // here yet. The @huggingface/transformers library that
      // implements them is ~17 MB and contains an inlined
      // onnxruntime-web WASM (~22 MB base64) that the bundler
      // can't separate. Wiring the loader into background.ts
      // balloons the bundle to ~62 MB. See
      // src/lib/embeddings/transformer_loader.ts for the
      // full discussion and the path to re-enable in v2
      // (likely requires a custom Vite plugin to extract the
      // WASM as a separate asset + a custom locateFile hook
      // for the ORT runtime). Until then, LOAD_EMBEDDING_MODEL
      // and EMBED_FIND_SIMILAR MSG types exist in the handler
      // but resolve to "not wired" if a future build adds
      // these deps. The cosine utility and the pre-computed
      // index ARE wired (see src/lib/embeddings-index.ts) and
      // can be exercised by tests today.
    };
    const { sync, reply } = handleMessage(msg, sender, deps);
    if (sync) {
      sendResponse(reply);
      return;
    }
    // async — the handler kicked off a fetch; resolve the response when it lands.
    // For IMPORT_BRIDGE we use the promise we already returned:
    const promise = reply as unknown as Promise<unknown>;
    promise
      ? promise.then((r) => sendResponse({ ok: true, data: r }))
            .catch((e) => sendResponse({ ok: false, error: String(e) }))
      : sendResponse({ ok: true });
    return true; // keep channel open
  });
});
