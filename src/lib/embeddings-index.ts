// Citation Nexus — Pre-computed embeddings index
//
// Loads `embeddings-index.json` (generated at build time by
// `scripts/precompute-embeddings.py`) and exposes a `findSimilar`
// function that does cosine-ranked top-K against the index.
//
// The index is small (a few hundred keywords × 384 floats =
// ~600 KB) so we load it lazily on first use and keep it in
// memory. No async, no file IO at query time.

import type { Finding } from "@/patterns/core";
import { cosineSimilarity } from "./embeddings/cosine";

/** JSON shape of `embeddings-index.json`. Hand-written so we
 *  don't need a JSON-schema validator at the bundle level. */
export interface IndexFile {
  model: string;
  dimensions: number;
  items: Array<{ keyword: string; vector: number[] }>;
}

/** In-memory representation: keyword + Float32Array for fast
 *  cosine. The original payload (e.g. patternId, category)
 *  is attached by the consumer at query time. */
export interface IndexEntry {
  keyword: string;
  vector: Float32Array;
}

let cached: IndexEntry[] | null = null;
let cacheLoading: Promise<IndexEntry[]> | null = null;

/** Resolve the URL of the bundled index file. Vite / wxt builds
 *  emit it at `.output/chrome-mv3/assets/embeddings-index.json`
 *  (configured in wxt.config.ts). */
function indexUrl(): string {
  // chrome.runtime is only available in the extension's extension
  // contexts (background, popup, content). For tests and pure
  // callers, the caller can pass an explicit URL.
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL("assets/embeddings-index.json");
  }
  // Fallback for tests / non-extension callers.
  return new URL(
    "../embeddings-index.json",
    import.meta.url
  ).toString();
}

/** Lazily load the index from the URL. Subsequent calls return
 *  the cached array. */
export async function loadIndex(
  fetchImpl: typeof fetch = fetch,
  url: string = indexUrl()
): Promise<IndexEntry[]> {
  if (cached) return cached;
  if (cacheLoading) return cacheLoading;
  cacheLoading = (async () => {
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(
        `Failed to load embeddings index from ${url}: ${res.status} ${res.statusText}`
      );
    }
    const json = (await res.json()) as IndexFile;
    const entries: IndexEntry[] = json.items.map((it) => ({
      keyword: it.keyword,
      vector: new Float32Array(it.vector),
    }));
    cached = entries;
    return entries;
  })();
  return cacheLoading;
}

/** Test-only: reset the cache. */
export function _resetIndexCache(): void {
  cached = null;
  cacheLoading = null;
}

export interface ScoredKeyword {
  keyword: string;
  similarity: number;
}

/** Find the top-k keywords most similar to `query`. Returns []
 *  if the index hasn't been loaded yet — callers should call
 *  loadIndex() first. */
export function findSimilar(
  query: Float32Array,
  entries: IndexEntry[],
  k: number
): ScoredKeyword[] {
  if (k <= 0 || entries.length === 0) return [];
  // Precompute similarities; n is small so a sort is fine.
  const scored: ScoredKeyword[] = entries
    .map((e) => ({
      keyword: e.keyword,
      similarity: cosineSimilarity(query, e.vector),
    }))
    .sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

/** Convenience: loadIndex + findSimilar in one call. Use this
 *  from the popup after the user types a query. */
export async function findSimilarAsync(
  query: Float32Array,
  k: number,
  fetchImpl?: typeof fetch,
  url?: string
): Promise<ScoredKeyword[]> {
  const entries = await loadIndex(fetchImpl, url);
  return findSimilar(query, entries, k);
}

// Re-export Finding type so the consumer doesn't need a separate
// import path.
export type { Finding };
