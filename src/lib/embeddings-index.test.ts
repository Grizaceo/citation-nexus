import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadIndex,
  findSimilar,
  _resetIndexCache,
  type IndexFile,
} from "@/lib/embeddings-index";

/** A small synthetic index for deterministic tests. We hand-craft
 *  the vectors so we know exactly what each keyword is "close
 *  to" in the fake space. Each vector is 8-dim to keep the
 *  test data tiny. */
const TEST_INDEX: IndexFile = {
  model: "test-fixture",
  dimensions: 8,
  items: [
    { keyword: "GPT-4o", vector: [1, 0, 0, 0, 0, 0, 0, 0] },
    { keyword: "Llama-3", vector: [0.95, 0.1, 0, 0, 0, 0, 0, 0] }, // close to GPT-4o
    { keyword: "Mistral", vector: [0.9, 0.2, 0, 0, 0, 0, 0, 0] }, // close to GPT-4o
    { keyword: "ResNet", vector: [0, 1, 0, 0, 0, 0, 0, 0] },
    { keyword: "ViT", vector: [0, 0.95, 0.1, 0, 0, 0, 0, 0] }, // close to ResNet
    { keyword: "Z boson", vector: [0, 0, 0, 1, 0, 0, 0, 0] },
    { keyword: "H2O", vector: [0, 0, 0, 0, 1, 0, 0, 0] },
    { keyword: "TP53", vector: [0, 0, 0, 0, 0, 1, 0, 0] },
    { keyword: "BRCA1", vector: [0, 0, 0, 0, 0, 0.95, 0.1, 0] }, // close to TP53
    { keyword: "arXiv:2401.01234", vector: [0, 0, 0, 0, 0, 0, 0, 1] },
  ],
};

function fakeFetchOk(payload: unknown): typeof fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function fakeFetchError(status: number, statusText: string): typeof fetch {
  return vi.fn(async () => {
    return new Response("not found", { status, statusText });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  _resetIndexCache();
});

describe("loadIndex", () => {
  it("loads and parses the index from the URL", async () => {
    const entries = await loadIndex(fakeFetchOk(TEST_INDEX), "file:///x.json");
    expect(entries).toHaveLength(10);
    // First entry: GPT-4o with vector [1, 0, 0, 0, 0, 0, 0, 0]
    expect(entries[0]!.keyword).toBe("GPT-4o");
    expect(entries[0]!.vector).toBeInstanceOf(Float32Array);
    expect(entries[0]!.vector.length).toBe(8);
    expect(entries[0]!.vector[0]).toBe(1);
  });

  it("caches after the first call (no second fetch)", async () => {
    const fetchImpl = fakeFetchOk(TEST_INDEX);
    await loadIndex(fetchImpl, "file:///x.json");
    await loadIndex(fetchImpl, "file:///x.json");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("concurrent callers share the same in-flight promise", async () => {
    let resolveJson: (v: unknown) => void = () => {};
    const fetchImpl = vi.fn(
      async () =>
        new Promise<Response>((resolve) => {
          resolveJson = (v) =>
            resolve(
              new Response(JSON.stringify(v), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              })
            );
        })
    ) as unknown as typeof fetch;

    const p1 = loadIndex(fetchImpl, "file:///x.json");
    const p2 = loadIndex(fetchImpl, "file:///x.json");
    resolveJson(TEST_INDEX);
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b); // same reference, same cached array
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws on non-2xx responses", async () => {
    await expect(
      loadIndex(fakeFetchError(404, "Not Found"), "file:///x.json")
    ).rejects.toThrow(/Failed to load embeddings index/);
  });
});

describe("findSimilar", () => {
  let entries: Awaited<ReturnType<typeof loadIndex>>;
  beforeEach(async () => {
    entries = await loadIndex(fakeFetchOk(TEST_INDEX), "file:///x.json");
  });

  it("returns the k most similar entries, highest first", () => {
    // Query points along the GPT-4o direction.
    const query = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    const top = findSimilar(query, entries, 3);
    expect(top.map((r) => r.keyword)).toEqual(["GPT-4o", "Llama-3", "Mistral"]);
  });

  it("scores are in [0, 1] for queries pointing in the same hemisphere", () => {
    const query = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    for (const r of findSimilar(query, entries, 10)) {
      expect(r.similarity).toBeGreaterThanOrEqual(0);
      expect(r.similarity).toBeLessThanOrEqual(1);
    }
  });

  it("identifies the exact match as the top hit", () => {
    const query = new Float32Array([0, 0, 0, 0, 0, 0, 0, 1]);
    const top = findSimilar(query, entries, 1);
    expect(top[0]!.keyword).toBe("arXiv:2401.01234");
    expect(top[0]!.similarity).toBe(1);
  });

  it("k=0 returns []", () => {
    const query = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(findSimilar(query, entries, 0)).toEqual([]);
  });

  it("k > n returns all entries", () => {
    const query = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    const all = findSimilar(query, entries, 100);
    expect(all).toHaveLength(entries.length);
  });

  it("ranks related entries (TP53, BRCA1) close together", () => {
    // Query along the TP53 direction. BRCA1 should be #2 because
    // its vector has a TP53 component (similar to Llama-3 near GPT-4o).
    const query = new Float32Array([0, 0, 0, 0, 0, 1, 0, 0]);
    const top = findSimilar(query, entries, 2);
    expect(top[0]!.keyword).toBe("TP53");
    expect(top[1]!.keyword).toBe("BRCA1");
    expect(top[1]!.similarity).toBeGreaterThan(top[2]?.similarity ?? 0);
  });

  it("empty entries returns []", () => {
    const query = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(findSimilar(query, [], 5)).toEqual([]);
  });
});

/** Smoke test against the actual pre-computed index file. The
 * precompute script writes to `public/assets/embeddings-index.json`;
 * WXT copies it to `.output/chrome-mv3/assets/embeddings-index.json`
 * at build time. We load the source file here (the build artifact
 * may not exist in dev) and assert the shape that the runtime
 * `loadIndex()` produces. This catches drift between the
 * precompute output schema and the runtime consumer. */
describe("embeddings-index.json (committed file)", () => {
  it("exists, is well-formed, and has the schema the runtime expects", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const REPO = path.resolve(__dirname, "..", "..");
    const FILE = path.join(REPO, "public", "assets", "embeddings-index.json");
    const text = await fs.readFile(FILE, "utf-8");
    const json = JSON.parse(text);
    expect(json.model).toBe("Xenova/paraphrase-multilingual-MiniLM-L12-v2");
    expect(json.dimensions).toBe(384);
    expect(Array.isArray(json.items)).toBe(true);
    expect(json.items.length).toBeGreaterThan(50);
    // Spot-check a few items
    for (const it of json.items.slice(0, 5)) {
      expect(typeof it.keyword).toBe("string");
      expect(Array.isArray(it.vector)).toBe(true);
      expect(it.vector.length).toBe(384);
      // All entries should be L2-normalized (unit length).
      const norm = Math.sqrt(
        it.vector.reduce((s: number, v: number) => s + v * v, 0)
      );
      expect(norm).toBeCloseTo(1, 2);
    }
  });
});
