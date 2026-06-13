// Citation Nexus — Vector math utilities for embeddings
//
// All functions are pure: no side effects, no async, no DOM. The
// shapes are Float32Array (or Float64Array) because that's what
// transformers.js / onnxruntime-web produce. Float32 is the
// canonical embedding dtype for the sentence-transformers family.

/**
 * Compute the dot product of two equally-sized vectors. Returns 0
 * for empty or mismatched inputs (rather than throwing) so the
 * caller can use the result in hot ranking loops without try/catch.
 */
export function dotProduct(
  a: Float32Array | number[],
  b: Float32Array | number[]
): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += a[i]! * b[i]!;
  }
  return sum;
}

/** L2 norm of a vector. */
export function l2Norm(a: Float32Array | number[]): number {
  return Math.sqrt(dotProduct(a, a));
}

/**
 * L2-normalize a vector in place (returns the same array for
 * chaining). The returned vector has ||v|| = 1. Vectors with
 * ||v|| = 0 are returned unchanged (degenerate case; the
 * caller should filter these out before ranking).
 */
export function l2Normalize(v: Float32Array): Float32Array {
  const n = l2Norm(v);
  if (n === 0) return v;
  for (let i = 0; i < v.length; i++) {
    v[i] = v[i]! / n;
  }
  return v;
}

/**
 * Cosine similarity in [-1, 1]. For L2-normalized vectors this is
 * just the dot product; for unnormalized vectors we divide by
 * the product of norms. Mismatched-length inputs return 0.
 */
export function cosineSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[]
): number {
  if (a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) return 0;
  const denom = l2Norm(a) * l2Norm(b);
  if (denom === 0) return 0;
  return dotProduct(a, b) / denom;
}

/** A scored item: anything with a numeric `vector` field. */
interface ScoredItem<T = unknown> {
  vector: Float32Array;
  payload?: T;
  similarity?: number; // populated by topK
}

/**
 * Return the top-k items ranked by cosine similarity to `query`,
 * highest first. Ties broken by original order. O(n log k) using
 * a min-heap of size k. We don't actually use a heap here for
 * simplicity — for n in the low thousands (our keyword index
 * size) a full sort is fine. If the index ever grows beyond
 * 10K items, swap this for a heap.
 */
export function topK<T>(
  query: Float32Array | number[],
  candidates: ScoredItem<T>[],
  k: number
): ScoredItem<T>[] {
  if (k <= 0) return [];
  // Precompute similarities; the sort is O(n log n) and beats
  // a heap for n < ~10000.
  const scored = candidates
    .map((c) => {
      const sim = cosineSimilarity(query, c.vector);
      return { ...c, similarity: sim };
    })
    // Sort descending by similarity. Stable sort preserves
      // original order for ties.
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
  return scored.slice(0, k);
}
