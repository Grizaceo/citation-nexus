// Citation Nexus — Native Messaging Host client.
//
// Chrome's native messaging API requires a registered host binary
// (see agent/manifest.json) and the `nativeMessaging` permission in
// the extension manifest. The host name is `com.nexus.host`.
//
// Reference: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
//
// The host is a small Python CLI (`agent/native_host.py`) that
// forwards each request to the local HTTP bridge. So from the
// extension's perspective, the native host is just an alternative
// transport to the same `bridge` operations — useful when an
// agent wants the message to *originate from* the extension
// itself (so the bridge URL never has to be exposed beyond
// loopback), and useful as a fallback when the bridge HTTP server
// is not running.

/** Name registered in agent/manifest.json. Must match exactly. */
export const NATIVE_HOST_NAME = "com.nexus.host";

/** Response shape returned by the host. Mirrors the bridge JSON. */
export interface NativeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface HealthData {
  ok: true;
  version: string;
}

export interface ImportData {
  stored: { path: string };
}

export interface PatternsData {
  sets: Array<{ id: string; name: string; patterns: string[] }>;
}

/**
 * Thin wrapper around `chrome.runtime.sendNativeMessage`.
 *
 * Chrome returns the response via callback (MV2) or Promise (MV3).
 * We prefer the Promise form, falling back to the callback if
 * `chrome.runtime.sendNativeMessage` doesn't return a thenable
 * (older Chromium, third-party browsers).
 */
function sendNative<T = unknown>(
  message: Record<string, unknown>
): Promise<NativeResponse<T>> {
  return new Promise((resolve) => {
    try {
      const r = (chrome.runtime.sendNativeMessage as unknown as (
        application: string,
        message: unknown,
        callback: (resp: NativeResponse<T>) => void
      ) => unknown)(NATIVE_HOST_NAME, message, (resp) => resolve(resp));
      // MV3: some builds return a Promise from sendNativeMessage.
      if (r && typeof (r as Promise<NativeResponse<T>>).then === "function") {
        (r as Promise<NativeResponse<T>>).then(resolve, (e) =>
          resolve({ ok: false, error: String(e) })
        );
      }
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

export async function nativeHealth(): Promise<NativeResponse<HealthData>> {
  return sendNative<HealthData>({ action: "health" });
}

export async function nativeImport(req: {
  category: string;
  patternId: string;
  text: string;
  source?: { url?: string; title?: string };
}): Promise<NativeResponse<ImportData>> {
  return sendNative<ImportData>({ action: "import", request: req });
}

export async function nativePatterns(): Promise<NativeResponse<PatternsData>> {
  return sendNative<PatternsData>({ action: "patterns" });
}
