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
  LOAD_EMBEDDING_MODEL: "LOAD_EMBEDDING_MODEL",
  EMBED_FIND_SIMILAR: "EMBED_FIND_SIMILAR",
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
    message: unknown,
    callback: (response: unknown) => void
  ) => unknown;
  /**
   * Async: load the named embedding model. Returns an embedder
   * function or throws. The dispatcher wraps in try/catch so the
   * popup sees a { ok, error } shape. */
  loadEmbeddingModel?: (modelId: string) => Promise<unknown>;
  /**
   * Async: embed a single text using the named model. Throws
   * if the model hasn't been loaded. */
  embedText?: (modelId: string, text: string) => Promise<Float32Array>;
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
    case MSG.LOAD_EMBEDDING_MODEL: {
      // Async: dynamic-imports @huggingface/transformers, downloads
      // the ONNX model from the HF CDN, caches in memory. The
      // popup calls this when the user picks a model from the
      // embeddings dropdown. Returns { ok, ms, error? }.
      const promise = new Promise<unknown>(async (resolve) => {
        if (!deps.loadEmbeddingModel) {
          resolve({ ok: false, error: "loadEmbeddingModel not wired" });
          return;
        }
        try {
          await deps.loadEmbeddingModel(msg.payload?.modelId ?? "multilingual");
          resolve({ ok: true, modelId: msg.payload?.modelId });
        } catch (e) {
          resolve({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
      return { sync: false, reply: promise };
    }
    case MSG.EMBED_FIND_SIMILAR: {
      // Async: embed the query text, then return the top-k matches
      // from the pre-computed keyword index. The actual index
      // lookup is the caller's job (popup) — we just embed here.
      // Wait, the lookup is in the popup; we want the embed + the
      // lookup in the same place so the index is cached server-side
      // (in the service worker). For v1 the lookup is local to
      // the popup; if the user reloads the popup the index reloads
      // (it's only 600KB so this is fine).
      const promise = new Promise<unknown>(async (resolve) => {
        if (!deps.embedText) {
          resolve({ ok: false, error: "embedText not wired" });
          return;
        }
        try {
          const text = (msg.payload?.text ?? "").trim();
          if (!text) {
            resolve({ ok: false, error: "empty text" });
            return;
          }
          const modelId = msg.payload?.modelId ?? "multilingual";
          const vector = await deps.embedText(modelId, text);
          resolve({
            ok: true,
            data: {
              modelId,
              text,
              vectorLength: vector.length,
              vector: Array.from(vector), // serialize for the message
            },
          });
        } catch (e) {
          resolve({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
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
