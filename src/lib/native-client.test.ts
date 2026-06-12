import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  NATIVE_HOST_NAME,
  nativeHealth,
  nativeImport,
  nativePatterns,
} from "@/lib/native-client";

/**
 * The native client uses `chrome.runtime.sendNativeMessage` directly
 * (not via DI). We mock the global chrome object before importing
 * the module under test, then reset between tests.
 */
function installChromeMock(
  implementation: (
    app: string,
    message: unknown,
    callback: (resp: unknown) => void
  ) => void
) {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendNativeMessage: vi.fn(implementation),
    },
  };
}

beforeEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
});

describe("native-client", () => {
  it("exposes the registered host name", () => {
    expect(NATIVE_HOST_NAME).toBe("com.nexus.host");
  });

  it("nativeHealth sends { action: 'health' } and resolves with the host's response", async () => {
    installChromeMock((_app, message, cb) => {
      expect((message as { action: string }).action).toBe("health");
      cb({ ok: true, data: { ok: true, version: "0.1.0" } });
    });
    const resp = await nativeHealth();
    expect(resp.ok).toBe(true);
    expect(resp.data?.version).toBe("0.1.0");
  });

  it("nativeImport wraps the request in { action: 'import', request }", async () => {
    installChromeMock((_app, message, cb) => {
      const m = message as { action: string; request: unknown };
      expect(m.action).toBe("import");
      expect(m.request).toEqual({
        category: "citation",
        patternId: "arxiv.id",
        text: "arXiv:2401.01234",
      });
      cb({ ok: true, data: { stored: { path: "/vault/x.md" } } });
    });
    const resp = await nativeImport({
      category: "citation",
      patternId: "arxiv.id",
      text: "arXiv:2401.01234",
    });
    expect(resp.ok).toBe(true);
    expect(resp.data?.stored.path).toBe("/vault/x.md");
  });

  it("nativePatterns sends { action: 'patterns' }", async () => {
    installChromeMock((_app, message, cb) => {
      expect((message as { action: string }).action).toBe("patterns");
      cb({ ok: true, data: { sets: [] } });
    });
    const resp = await nativePatterns();
    expect(resp.ok).toBe(true);
  });

  it("resolves with { ok: false, error } if the host throws synchronously", async () => {
    installChromeMock(() => {
      throw new Error("host not registered");
    });
    const resp = await nativeHealth();
    expect(resp.ok).toBe(false);
    expect(resp.error).toMatch(/host not registered/);
  });
});
