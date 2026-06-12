import { describe, it, expect } from "vitest";
import {
  dotProduct,
  l2Norm,
  l2Normalize,
  cosineSimilarity,
  topK,
} from "@/lib/embeddings/cosine";

function f32(...vals: number[]): Float32Array {
  return new Float32Array(vals);
}

describe("dotProduct", () => {
  it("computes a basic dot product", () => {
    expect(dotProduct(f32(1, 2, 3), f32(4, 5, 6))).toBe(1 * 4 + 2 * 5 + 3 * 6);
  });

  it("returns 0 for mismatched-length inputs (truncates to shorter)", () => {
    expect(dotProduct(f32(1, 2, 3), f32(10))).toBe(10);
  });

  it("returns 0 for empty inputs", () => {
    expect(dotProduct(f32(), f32(1, 2))).toBe(0);
  });

  it("is commutative", () => {
    const a = f32(0.1, 0.2, 0.3, 0.4);
    const b = f32(0.5, 0.6, 0.7, 0.8);
    expect(dotProduct(a, b)).toBeCloseTo(dotProduct(b, a));
  });
});

describe("l2Norm", () => {
  it("computes Euclidean norm", () => {
    // ||(3, 4)|| = 5
    expect(l2Norm(f32(3, 4))).toBe(5);
  });

  it("returns 0 for zero vector", () => {
    expect(l2Norm(f32(0, 0, 0))).toBe(0);
  });
});

describe("l2Normalize", () => {
  it("returns a unit-length vector in the same direction", () => {
    const v = l2Normalize(f32(3, 4));
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
    expect(l2Norm(v)).toBeCloseTo(1.0);
  });

  it("preserves the input array (in-place mutation)", () => {
    const v = f32(10, 0, 0);
    const out = l2Normalize(v);
    expect(out).toBe(v); // same reference
    expect(v[0]).toBe(1);
  });

  it("returns the zero vector unchanged", () => {
    const v = f32(0, 0, 0);
    l2Normalize(v);
    expect(v[0]).toBe(0);
    expect(v[1]).toBe(0);
  });
});

describe("cosineSimilarity", () => {
  it("is 1.0 for identical vectors", () => {
    const v = f32(0.1, 0.2, 0.3);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("is 0.0 for orthogonal vectors", () => {
    expect(cosineSimilarity(f32(1, 0, 0), f32(0, 1, 0))).toBeCloseTo(0.0);
  });

  it("is -1.0 for opposite vectors", () => {
    expect(cosineSimilarity(f32(1, 0, 0), f32(-1, 0, 0))).toBeCloseTo(-1.0);
  });

  it("is 0 for mismatched-length inputs (no throw)", () => {
    expect(cosineSimilarity(f32(1, 2, 3), f32(1, 2))).toBe(0);
  });

  it("is 0 for empty inputs", () => {
    expect(cosineSimilarity(f32(), f32())).toBe(0);
  });

  it("is 0 for zero vectors (no NaN)", () => {
    expect(cosineSimilarity(f32(0, 0, 0), f32(1, 2, 3))).toBe(0);
  });

  it("scale-invariant: multiplying one vector by a constant doesn't change the score", () => {
    const a = f32(1, 2, 3);
    const b = f32(0.5, 1, 1.5);
    const c = f32(5, 10, 15);
    // a and b are scalar multiples (a = 2 * b)
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
    expect(cosineSimilarity(a, c)).toBeCloseTo(1.0);
  });
});

describe("topK", () => {
  // First candidate is identical to the query, so its cosine is
  // exactly 1.0 (no float drift). The rest form a 2D arrangement
  // around it.
  const query = f32(1, 0, 0);
  const candidates = [
    { vector: f32(1, 0, 0), payload: "identical" },
    { vector: f32(0.9, 0.1, 0), payload: "near-x" },
    { vector: f32(0, 1, 0), payload: "y-axis" },
    { vector: f32(-1, 0, 0), payload: "anti-x" },
    { vector: f32(0.7, 0.3, 0), payload: "kinda-x" },
    { vector: f32(0, 0, 1), payload: "z-axis" },
  ];

  it("returns the top-k most similar items, highest first", () => {
    const top = topK(query, candidates, 3);
    expect(top.map((c) => c.payload)).toEqual([
      "identical",
      "near-x",
      "kinda-x",
    ]);
  });

  it("annotates each item with its similarity score", () => {
    const top = topK(query, candidates, 1);
    expect(top[0]!.payload).toBe("identical");
    // Identical vectors -> cosine exactly 1.0.
    expect(top[0]!.similarity).toBe(1.0);
  });

  it("returns [] when k=0", () => {
    expect(topK(query, candidates, 0)).toEqual([]);
  });

  it("returns all candidates when k > n", () => {
    const top = topK(query, candidates, 100);
    expect(top).toHaveLength(candidates.length);
  });

  it("returns [] for empty candidates", () => {
    expect(topK(query, [], 5)).toEqual([]);
  });
});
