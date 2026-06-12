// Citation Nexus — Background message routing
// Pure function that dispatches an incoming chrome.runtime message to
// the appropriate handler. Extracted from background.ts so it can be
// unit-tested without a real chrome.* global.

import type { Finding } from "@/patterns/core";

export interface TabState {
  url: string;
  title: string;
  findings: Finding[];
  scannedAt: number;
}

export const MSG = {
  GET_TAB_CITATIONS: "GET_TAB_CITATIONS",
  CITATIONS_UPDATE: "CITATIONS_UPDATE",
  REQUEST_SCAN: "REQUEST_SCAN",
  COPY_FINDING: "COPY_FINDING",
  IMPORT_BRIDGE: "IMPORT_BRIDGE",
  NATIVE_HEALTH: "NATIVE_HEALTH",
  NATIVE_IMPORT: "NATIVE_IMPORT",
  DOWNLOAD_PAPER: "DOWNLOAD_PAPER",
} as const;

export type MessageType = (typeof MSG)[keyof typeof MSG];

/** Minimal surface the dispatcher needs from chrome.* APIs. */
export interface BridgeDeps {
  tabStates: Map<number, TabState>;
  fetch: typeof fetch;
  clipboard: { writeText: (text: string) => Promise<void> };
  executeScript: (tabId: number, files: string[]) => Promise<unknown>;
  sendNativeMessage: (
    application: string,
    message: any,
    callback: (response: unknown) => void
  ) => unknown;
}

export interface IncomingMessage {
  type: string;
  payload?: any;
  tabId?: number;
  key?: string;
  senderTabId?: number;
}

export interface Sender {
  /** Loose shape: we only read .id. The real chrome.runtime.MessageSender
   *  has Tab | undefined, where Tab.id is number | undefined. We
   *  tolerate that and fall back to msg.senderTabId. */
  tab?: { id?: number };
}

/**
 * Route a single message. Returns true if the handler replied
 * synchronously (caller should call sendResponse). False means the
 * handler will reply later (caller must return true to keep the
 * channel open).
 */
export function handleMessage(
  msg: IncomingMessage,
  sender: Sender,
  deps: BridgeDeps
): { sync: boolean; reply: unknown } {
  switch (msg.type) {
    case MSG.CITATIONS_UPDATE: {
      const tabId = sender.tab?.id ?? msg.senderTabId ?? -1;
      deps.tabStates.set(tabId, {
        url: msg.payload?.url ?? "",
        title: msg.payload?.title ?? "",
        findings: msg.payload?.findings ?? [],
        scannedAt: Date.now(),
      });
      return { sync: true, reply: { ok: true } };
    }
    case MSG.GET_TAB_CITATIONS: {
      const tabId = msg.tabId ?? -1;
      const state =
        deps.tabStates.get(tabId) ?? {
          url: "",
          title: "",
          findings: [],
          scannedAt: 0,
        };
      return { sync: true, reply: { ok: true, state } };
    }
    case MSG.COPY_FINDING: {
      const tabId = sender.tab?.id ?? -1;
      const state = deps.tabStates.get(tabId);
      const finding = state?.findings.find(
        (f) => `${f.start}-${f.end}` === msg.key
      );
      if (finding) {
        // Fire-and-forget; the user clicked Copy, the response is
        // best-effort.
        void deps.clipboard.writeText(finding.text);
        return { sync: true, reply: { ok: true, copied: finding.text } };
      }
      return { sync: true, reply: { ok: false, error: "Finding not found" } };
    }
    case MSG.IMPORT_BRIDGE: {
      // Async; returns a promise resolved later. Caller must return
      // true to keep the channel open.
      deps
        .fetch("http://127.0.0.1:3002/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg.payload),
        })
        .then((r) => r.json())
        .then((data) => ({ ok: true, data }))
        .catch((e) => ({ ok: false, error: String(e) }));
      return { sync: false, reply: undefined };
    }
    case MSG.NATIVE_HEALTH: {
      // Async; the reply is the host's response.
      const promise = new Promise<unknown>((resolve) => {
        try {
          deps.sendNativeMessage(
            "com.nexus.host",
            { action: "health" },
            (resp) => resolve({ ok: true, data: resp })
          );
        } catch (e) {
          resolve({ ok: false, error: String(e) });
        }
      });
      return { sync: false, reply: promise };
    }
    case MSG.NATIVE_IMPORT: {
      // Async; the reply is the host's response.
      const promise = new Promise<unknown>((resolve) => {
        try {
          deps.sendNativeMessage(
            "com.nexus.host",
            { action: "import", request: msg.payload },
            (resp) => resolve({ ok: true, data: resp })
          );
        } catch (e) {
          resolve({ ok: false, error: String(e) });
        }
      });
      return { sync: false, reply: promise };
    }
    case MSG.DOWNLOAD_PAPER: {
      // Same shape as NATIVE_IMPORT — calls the native host's
      // 'download' action, which fetches the URL and writes to
      // ~/.local/share/nexus/vault/papers/<category>/<filename>.<ext>.
      // The popup passes the DownloadInfo (url, category, filename,
      // format) computed by the pure downloader module.
      const promise = new Promise<unknown>((resolve) => {
        try {
          deps.sendNativeMessage(
            "com.nexus.host",
            { action: "download", request: msg.payload },
            (resp) => resolve({ ok: true, data: resp })
          );
        } catch (e) {
          resolve({ ok: false, error: String(e) });
        }
      });
      return { sync: false, reply: promise };
    }
    case MSG.REQUEST_SCAN: {
      const tabId = sender.tab?.id ?? -1;
      if (tabId !== -1) {
        void deps.executeScript(tabId, ["content-scripts/content.js"]);
      }
      return { sync: true, reply: { ok: true } };
    }
    default:
      return { sync: true, reply: { ok: false, error: "Unknown message type" } };
  }
}
