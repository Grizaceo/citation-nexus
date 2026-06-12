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
