import { describe, it, expect, vi } from "vitest";
import {
  checkModelStatus,
  loadModel,
  embedText,
  formatStatus,
  type RuntimeBridge,
} from "@/lib/embeddings/dev_tools";

/** A fake bridge that records every sendMessage call and
 *  responds based on a per-test queue. */
function makeBridge(
  responses: Array<unknown>
): RuntimeBridge & {
  sent: unknown[];
  errors: Array<string | undefined>;
} {
  const sent: unknown[] = [];
  const errors: Array<string | undefined> = [];
  let i = 0;
  return {
    sent,
    errors,
    async sendMessage(msg: unknown) {
      sent.push(msg);
      const r = responses[i++];
      if (r instanceof Error) throw r;
      if (r === "THROW") throw new Error("network down");
      return r;
    },
  };
}

describe("checkModelStatus", () => {
  it("returns 'off' when the bridge returns no response", async () => {
    const b = makeBridge([undefined]);
    const r = await checkModelStatus(b);
    expect(r.status).toBe("off");
    expect(r.modelId).toBe(null);
    expect(b.sent).toHaveLength(1);
  });

  it("returns 'loaded' when the bridge returns ok=true", async () => {
    const b = makeBridge([{ ok: true, data: { vectorLength: 384 } }]);
    const r = await checkModelStatus(b);
    expect(r.status).toBe("loaded");
    expect(r.modelId).toBe("multilingual");
  });

  it("returns 'off' when the bridge returns 'not loaded' error", async () => {
    const b = makeBridge([{ ok: false, error: "model not loaded" }]);
    const r = await checkModelStatus(b);
    expect(r.status).toBe("off");
  });

  it("returns 'loading' when the bridge returns 'loading' error", async () => {
    const b = makeBridge([{ ok: false, error: "model is loading" }]);
    const r = await checkModelStatus(b);
    expect(r.status).toBe("loading");
  });

  it("returns 'error' for any other error string", async () => {
    const b = makeBridge([{ ok: false, error: "WASM compile failed" }]);
    const r = await checkModelStatus(b);
    expect(r.status).toBe("error");
    expect(r.error).toBe("WASM compile failed");
  });

  it("returns 'error' when the bridge throws", async () => {
    const b = makeBridge(["THROW"]);
    const r = await checkModelStatus(b);
    expect(r.status).toBe("error");
    expect(r.error).toBe("network down");
  });
});

describe("loadModel", () => {
  it("sends LOAD_EMBEDDING_MODEL and returns ok=true on success", async () => {
    const b = makeBridge([{ ok: true, modelId: "multilingual" }]);
    const r = await loadModel(b, "multilingual");
    expect(r).toEqual({ ok: true });
    expect(b.sent[0]).toEqual({
      type: "LOAD_EMBEDDING_MODEL",
      payload: { modelId: "multilingual" },
    });
  });

  it("returns ok=false with error on failure", async () => {
    const b = makeBridge([{ ok: false, error: "WASM not found" }]);
    const r = await loadModel(b, "multilingual");
    expect(r).toEqual({ ok: false, error: "WASM not found" });
  });

  it("returns ok=false with 'no response' when bridge returns undefined", async () => {
    const b = makeBridge([undefined]);
    const r = await loadModel(b, "multilingual");
    expect(r).toEqual({ ok: false, error: "no response" });
  });
});

describe("embedText", () => {
  it("returns vector length and head on success", async () => {
    const v = new Array(384).fill(0).map((_, i) => i * 0.01);
    const b = makeBridge([{ ok: true, data: { vectorLength: 384, vector: v } }]);
    const r = await embedText(b, "Llama-3");
    expect(r.ok).toBe(true);
    expect(r.vectorLength).toBe(384);
    expect(r.vectorHead).toEqual([0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07]);
  });

  it("returns ok=false with error message on failure", async () => {
    const b = makeBridge([{ ok: false, error: "model not loaded" }]);
    const r = await embedText(b, "test");
    expect(r).toEqual({ ok: false, error: "model not loaded" });
  });

  it("returns ok=false when data is missing the vector", async () => {
    const b = makeBridge([{ ok: true, data: { vectorLength: 0 } }]);
    const r = await embedText(b, "test");
    expect(r.ok).toBe(true);
    expect(r.vectorHead).toBeUndefined();
  });
});

describe("formatStatus", () => {
  it("formats a loaded status with uptime", () => {
    const out = formatStatus({
      status: "loaded",
      uptimeSec: 42,
      error: null,
      modelId: "multilingual",
    });
    expect(out).toContain("status:   loaded");
    expect(out).toContain("modelId:  multilingual");
    expect(out).toContain("uptime:   42.0 s");
    expect(out).not.toContain("error:");
  });

  it("formats an error status with the message", () => {
    const out = formatStatus({
      status: "error",
      uptimeSec: -1,
      error: "WASM missing",
      modelId: "multilingual",
    });
    expect(out).toContain("status:   error");
    expect(out).toContain("error:    WASM missing");
  });

  it("formats an off status with no extras", () => {
    const out = formatStatus({
      status: "off",
      uptimeSec: -1,
      error: null,
      modelId: null,
    });
    expect(out).toBe("status:   off");
  });
});
