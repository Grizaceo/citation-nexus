import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleMessage, MSG } from "@/lib/background-handler";
import type { Finding } from "@/patterns/core";
import type { BridgeDeps } from "@/lib/background-handler";

const sampleFinding = (start: number, end: number, text = "x"): Finding => ({
  patternId: "test.id",
  category: "citation",
  label: "Test",
  text,
  start,
  end,
  node: {} as Text,
});

function makeDeps(overrides: Partial<BridgeDeps> = {}): BridgeDeps {
  const tabStates = new Map();
  return {
    tabStates,
    fetch: vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stored: { path: "/x" } }),
    }) as unknown as typeof fetch,
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined) as unknown as (
        text: string
      ) => Promise<void>,
    },
    executeScript: vi.fn().mockResolvedValue(undefined) as unknown as (
      tabId: number,
      files: string[]
    ) => Promise<unknown>,
    ...overrides,
  };
}

describe("handleMessage — CITATIONS_UPDATE", () => {
  it("stores findings under sender.tab.id", () => {
    const deps = makeDeps();
    const { sync, reply } = handleMessage(
      {
        type: MSG.CITATIONS_UPDATE,
        payload: {
          url: "https://example.com",
          title: "Title",
          findings: [sampleFinding(0, 5, "arXiv:")],
        },
      },
      { tab: { id: 42 } },
      deps
    );
    expect(sync).toBe(true);
    expect(reply).toEqual({ ok: true });
    expect(deps.tabStates.get(42)).toMatchObject({
      url: "https://example.com",
      title: "Title",
    });
  });

  it("falls back to msg.senderTabId when sender.tab is missing", () => {
    const deps = makeDeps();
    handleMessage(
      { type: MSG.CITATIONS_UPDATE, senderTabId: 99, payload: { findings: [] } },
      {},
      deps
    );
    expect(deps.tabStates.get(99)).toBeDefined();
  });

  it("falls back to -1 when neither sender.tab nor senderTabId is set", () => {
    const deps = makeDeps();
    handleMessage(
      { type: MSG.CITATIONS_UPDATE, payload: { findings: [] } },
      {},
      deps
    );
    expect(deps.tabStates.get(-1)).toBeDefined();
  });
});

describe("handleMessage — GET_TAB_CITATIONS", () => {
  it("returns the stored state for the requested tab", () => {
    const deps = makeDeps();
    deps.tabStates.set(7, {
      url: "u",
      title: "t",
      findings: [sampleFinding(0, 1)],
      scannedAt: 100,
    });
    const { reply } = handleMessage(
      { type: MSG.GET_TAB_CITATIONS, tabId: 7 },
      {},
      deps
    );
    expect((reply as any).ok).toBe(true);
    expect((reply as any).state.url).toBe("u");
  });

  it("returns empty state for unknown tab", () => {
    const deps = makeDeps();
    const { reply } = handleMessage(
      { type: MSG.GET_TAB_CITATIONS, tabId: 999 },
      {},
      deps
    );
    const state = (reply as any).state;
    expect(state.url).toBe("");
    expect(state.findings).toHaveLength(0);
  });
});

describe("handleMessage — COPY_FINDING", () => {
  it("copies the matching finding to clipboard and replies", () => {
    const deps = makeDeps();
    deps.tabStates.set(1, {
      url: "",
      title: "",
      findings: [sampleFinding(10, 20, "Transformer")],
      scannedAt: 0,
    });
    const { sync, reply } = handleMessage(
      { type: MSG.COPY_FINDING, key: "10-20", tabId: 1 },
      { tab: { id: 1 } },
      deps
    );
    expect(sync).toBe(true);
    expect((reply as any).copied).toBe("Transformer");
    expect(deps.clipboard.writeText).toHaveBeenCalledWith("Transformer");
  });

  it("returns error when key doesn't match any finding", () => {
    const deps = makeDeps();
    deps.tabStates.set(1, {
      url: "",
      title: "",
      findings: [sampleFinding(10, 20)],
      scannedAt: 0,
    });
    const { reply } = handleMessage(
      { type: MSG.COPY_FINDING, key: "99-100", tabId: 1 },
      { tab: { id: 1 } },
      deps
    );
    expect((reply as any).ok).toBe(false);
    expect(deps.clipboard.writeText).not.toHaveBeenCalled();
  });
});

describe("handleMessage — REQUEST_SCAN", () => {
  it("invokes executeScript for the active tab", () => {
    const deps = makeDeps();
    const { sync, reply } = handleMessage(
      { type: MSG.REQUEST_SCAN },
      { tab: { id: 5 } },
      deps
    );
    expect(sync).toBe(true);
    expect(reply).toEqual({ ok: true });
    expect(deps.executeScript).toHaveBeenCalledWith(5, [
      "content-scripts/content.js",
    ]);
  });

  it("no-ops when tab id is unknown", () => {
    const deps = makeDeps();
    handleMessage({ type: MSG.REQUEST_SCAN }, {}, deps);
    expect(deps.executeScript).not.toHaveBeenCalled();
  });
});

describe("handleMessage — IMPORT_BRIDGE", () => {
  it("kicks off an async fetch (sync: false)", () => {
    const deps = makeDeps();
    const { sync } = handleMessage(
      { type: MSG.IMPORT_BRIDGE, payload: { category: "citation" } },
      {},
      deps
    );
    expect(sync).toBe(false);
    // The fetch was called; response will be sent later.
    expect(deps.fetch).toHaveBeenCalled();
  });
});

describe("handleMessage — default", () => {
  it("returns 'Unknown message type' for unrecognized messages", () => {
    const deps = makeDeps();
    const { reply } = handleMessage(
      { type: "WHAT_IS_THAT" },
      {},
      deps
    );
    expect((reply as any).ok).toBe(false);
    expect((reply as any).error).toBe("Unknown message type");
  });
});
