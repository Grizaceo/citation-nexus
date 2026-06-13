// Citation Nexus — Embedding ad-hoc test utilities
//
// The "ad-hoc test" surface for the embeddings feature. The
// popup's Dev Tools section uses these; the user can also
// import them from the browser console of the extension's
// background page to inspect model state, run a probe embed,
// or stress-test the find-similar endpoint with arbitrary
// queries.
//
// Keep this module DOM-free and pure (no chrome.* globals
// except what's passed in). The popup passes a runtime
// bridge; unit tests pass a fake.

/** Status of the in-memory embedding model in the service
 *  worker. The popup can render different UI per state. */
export type ModelStatus =
  | "off" // user hasn't picked a model from the dropdown
  | "loading" // LOAD_EMBEDDING_MODEL is in flight
  | "loaded" // model is in memory, ready to embed
  | "error"; // last load attempt failed; error field populated

export interface ModelStatusReport {
  status: ModelStatus;
  /** Seconds since the model was loaded. -1 if not loaded. */
  uptimeSec: number;
  /** Last error message if status === 'error'. */
  error: string | null;
  /** Reported model id if loaded. */
  modelId: string | null;
}

/** Send a message to the background. Bridge is injected so
 *  unit tests can substitute. */
export type RuntimeBridge = {
  sendMessage: (msg: unknown) => Promise<unknown>;
};

/** Probe the background for the current model state.
 *  Returns a status report. The actual "is the model loaded?"
 *  state lives in the service worker; this sends a synthetic
 *  query that the dispatcher can respond to. */
export async function checkModelStatus(
  bridge: RuntimeBridge
): Promise<ModelStatusReport> {
  // We use EMBED_FIND_SIMILAR with a known-empty string as a
  // "ping" — the dispatcher will respond with the current
  // model state via the error message. This avoids adding
  // a new MSG type just for status.
  try {
    const res = (await bridge.sendMessage({
      type: "EMBED_FIND_SIMILAR",
      payload: { text: "", modelId: "multilingual" },
    })) as { ok?: boolean; error?: string; data?: unknown } | undefined;
    if (!res) {
      return {
        status: "off",
        uptimeSec: -1,
        error: null,
        modelId: null,
      };
    }
    if (res.ok) {
      return {
        status: "loaded",
        uptimeSec: 0,
        error: null,
        modelId: "multilingual",
      };
    }
    // The error string from the dispatcher encodes the state.
    // Examples: "model not loaded" -> off, "load in progress" ->
    // loading, anything else -> error.
    const err = (res.error ?? "").toLowerCase();
    if (err.includes("not loaded") || err.includes("not wired")) {
      return { status: "off", uptimeSec: -1, error: null, modelId: null };
    }
    if (err.includes("loading")) {
      return {
        status: "loading",
        uptimeSec: 0,
        error: null,
        modelId: "multilingual",
      };
    }
    return {
      status: "error",
      uptimeSec: -1,
      error: res.error ?? "unknown error",
      modelId: "multilingual",
    };
  } catch (e) {
    return {
      status: "error",
      uptimeSec: -1,
      error: e instanceof Error ? e.message : String(e),
      modelId: null,
    };
  }
}

/** Trigger a model load. The popup calls this when the user
 *  picks a model from the dropdown. Resolves with the status
 *  after the load completes (or fails).
 *
 *  `modelId` is typed as `string` rather than the narrower
 *  `ModelId` literal so the popup can pass values that haven't
 *  been pre-validated against the registry (e.g. from a stale
 *  <select>). The background normalizes the value through the
 *  same registry before the actual load. */
export async function loadModel(
  bridge: RuntimeBridge,
  modelId: string
): Promise<{ ok: boolean; error?: string }> {
  const res = (await bridge.sendMessage({
    type: "LOAD_EMBEDDING_MODEL",
    payload: { modelId },
  })) as { ok?: boolean; error?: string } | undefined;
  if (!res) return { ok: false, error: "no response" };
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true };
}

/** Embed a single string. The background returns the full
 *  vector (JSON-serialized). For ad-hoc tests the user
 *  typically only needs the length and a hash of the
 *  first few components to verify reproducibility. */
export async function embedText(
  bridge: RuntimeBridge,
  text: string,
  modelId: "multilingual" = "multilingual"
): Promise<{
  ok: boolean;
  vectorLength?: number;
  vectorHead?: number[];
  error?: string;
}> {
  const res = (await bridge.sendMessage({
    type: "EMBED_FIND_SIMILAR",
    payload: { text, modelId },
  })) as
    | {
        ok?: boolean;
        error?: string;
        data?: { vectorLength?: number; vector?: number[] };
      }
    | undefined;
  if (!res) return { ok: false, error: "no response" };
  if (!res.ok) return { ok: false, error: res.error };
  const v = res.data?.vector;
  return {
    ok: true,
    vectorLength: res.data?.vectorLength,
    vectorHead: Array.isArray(v) ? v.slice(0, 8) : undefined,
  };
}

/** Format a status report for human-readable display in the
 *  dev tools output area. */
export function formatStatus(r: ModelStatusReport): string {
  const lines: string[] = [];
  lines.push(`status:   ${r.status}`);
  if (r.modelId) lines.push(`modelId:  ${r.modelId}`);
  if (r.uptimeSec >= 0) lines.push(`uptime:   ${r.uptimeSec.toFixed(1)} s`);
  if (r.error) lines.push(`error:    ${r.error}`);
  return lines.join("\n");
}
