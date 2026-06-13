// Citation Nexus — Background Service Worker
// Owns tab state, popup ↔ content messaging, and bridge to local HTTP server.

import type { Finding } from "@/patterns/core";
import { handleMessage, MSG } from "@/lib/background-handler";
import {
  loadModel,
  loadModelAndReport,
  embedText as embedTextFn,
} from "@/lib/embeddings/transformer_loader";

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
      // Embedding model wiring. The loader does its own dynamic
      // import of @huggingface/transformers; the WASM is extracted
      // by wxt-plugins/transformers-wasm.ts so the bundle stays
      // small (~564 KB JS, 23 MB WASM) instead of ballooning to
      // 62 MB in a single background.js.
      loadEmbeddingModel: async (modelId: string) => {
        const r = await loadModelAndReport(modelId as "multilingual");
        if (!r.ok) throw new Error(r.error);
        return r;
      },
      embedText: async (modelId: string, text: string) => {
        // loadModel is idempotent and cached, so the second
        // call here just returns the cached embedder.
        await loadModel(modelId as "multilingual");
        return embedTextFn(modelId as "multilingual", text);
      },
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
