// Citation Nexus — Background Service Worker
// Owns tab state, popup ↔ content messaging, and bridge to local HTTP server.

import type { Finding } from "@/patterns/core";

interface TabState {
  url: string;
  title: string;
  findings: Finding[];
  scannedAt: number;
}

const MSG = {
  GET_TAB_CITATIONS: "GET_TAB_CITATIONS",
  CITATIONS_UPDATE: "CITATIONS_UPDATE",
  REQUEST_SCAN: "REQUEST_SCAN",
  COPY_FINDING: "COPY_FINDING",
  IMPORT_BRIDGE: "IMPORT_BRIDGE",
} as const;

const tabStates = new Map<number, TabState>();

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case MSG.CITATIONS_UPDATE: {
        // sender.tab.id is set for messages from content scripts; fall
        // back to senderTabId in the payload (e.g. for tests / devtools).
        const tabId = sender.tab?.id ?? msg.senderTabId ?? -1;
        tabStates.set(tabId, {
          url: msg.payload.url,
          title: msg.payload.title,
          findings: msg.payload.findings,
          scannedAt: Date.now(),
        });
        sendResponse({ ok: true });
        return;
      }
      case MSG.GET_TAB_CITATIONS: {
        const state = tabStates.get(msg.tabId) ?? {
          url: "",
          title: "",
          findings: [],
          scannedAt: 0,
        };
        sendResponse({ ok: true, state });
        return;
      }
      case MSG.COPY_FINDING: {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id;
          const state = tabId !== undefined ? tabStates.get(tabId) : undefined;
          const finding = state?.findings.find(
            (f) => `${f.start}-${f.end}` === msg.payload.key
          );
          if (finding) {
            navigator.clipboard.writeText(finding.text);
            sendResponse({ ok: true, copied: finding.text });
          } else {
            sendResponse({ ok: false, error: "Finding not found" });
          }
        });
        return true;
      }
      case MSG.IMPORT_BRIDGE: {
        fetch("http://127.0.0.1:3002/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg.payload),
        })
          .then((r) => r.json())
          .then((data) => sendResponse({ ok: true, data }))
          .catch((e) => sendResponse({ ok: false, error: String(e) }));
        return true;
      }
      case MSG.REQUEST_SCAN: {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const tabId = tabs[0]?.id;
          if (tabId !== undefined) {
            chrome.scripting.executeScript({
              target: { tabId },
              files: ["content-scripts/content.js"],
            });
          }
        });
        sendResponse({ ok: true });
        return;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  });
});
