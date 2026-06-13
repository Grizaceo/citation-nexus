// Citation Nexus — transformers.js wrapper
//
// Lazy-loads the @huggingface/transformers library (the official
// Hugging Face JS port) and exposes a thin API for embedding text
// and computing cosine similarity. The model file itself is
// downloaded on first use from the Hugging Face CDN and cached by
// Chrome (Cache Storage); subsequent popup opens reuse the cached
// model in milliseconds.
//
// v1 ships only the multilingual model. v2 will add SPECTER2
// (English scholar) and fastText (word-level keywords).
//
// We dynamic-import the library so it doesn't end up in the
// background's service-worker bundle if the user never picks
// a model from the popup. The first user that picks
// "Multilingual" from the dropdown pays the ~5s download cost;
// everyone else reuses the Chrome cache.

import type { ModelId } from "./models";

/** A loaded model is a function: text -> embedding vector. The
 *  Float32Array is the standard output dtype of the MiniLM
 *  family. */
type Embedder = (text: string) => Promise<Float32Array>;

/** Cached model instances, keyed by ModelId. Re-loading is a
 *  no-op after the first call (the library caches internally
 *  too, but we want to short-circuit even before that). */
const loaded = new Map<ModelId, Promise<Embedder>>();

/** Result of a load attempt — what the popup needs to show
 *  progress and the user needs to know. */
type LoadResult =
  | { ok: true; modelId: ModelId; ms: number }
  | { ok: false; modelId: ModelId; error: string };

/** Map ModelId -> HuggingFace model id (the on-the-wire name
 *  transformers.js fetches). The ONNX-quantized versions are
 *  what @huggingface/transformers loads by default for these
 *  hub IDs. */
const HF_MODEL_ID: Record<ModelId, string> = {
  multilingual: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
  // v2 — placeholder until the user runs the SPECTER2 setup.
  scholar: "allenai/specter2_base",
  // v2 — word-level keyword vectors, 157 languages.
  keywords: "facebook/fasttext-wiki-news-subword-300",
};

/** Load the model. Idempotent: a second call while the first is
 *  in flight returns the same promise. The actual ONNX/WASM
 *  files are fetched from the HF CDN on first call and cached
 *  by the library (and by Chrome's HTTP cache). */
export function loadModel(modelId: ModelId): Promise<Embedder> {
  const existing = loaded.get(modelId);
  if (existing) return existing;

  const promise = (async (): Promise<Embedder> => {
    // Dynamic import so the @huggingface/transformers bundle
    // (which pulls in onnxruntime-web and ~17MB of WASM data) is
    // only fetched when the user actually picks a model. The
    // ONNX runtime WASM is extracted from the library source by
    // the wxt-plugins/transformers-wasm.ts Vite plugin and
    // emitted as a separate asset under .output/chrome-mv3/
    // assets/ort-wasm-N.wasm, so it doesn't bloat background.js.
    const transformers = await import("@huggingface/transformers");
    const pipeline = transformers.pipeline;
    const env = transformers.env;

    // Configure the runtime: use the official remote model
    // files (Xenova mirror on huggingface CDN). The library
    // default for v3+ is 'transformers.js' hosting; we
    // explicitly set 'auto' so the env var HOMEPAGE / local
    // cache can override at test time.
    env.allowLocalModels = false;
    env.allowRemoteModels = true;

    const pipe = await pipeline(
      "feature-extraction",
      HF_MODEL_ID[modelId],
      { dtype: "q8" } // uint8 quantization, smallest size
    );

    // The pipeline returns a function; we wrap it so the
    // shape is uniform (Promise<Float32Array>) regardless of
    // whether the underlying model batches inputs.
    return async (text: string): Promise<Float32Array> => {
      const out = await pipe(text, { pooling: "mean", normalize: true });
      // `out` is a Tensor; toData() gives a Float32Array. The
      // shape is [1, dimensions] for a single input.
      const data = out.data as Float32Array;
      // The model may return a Tensor that wraps a view; copy
      // to a fresh array so the caller can't accidentally
      // mutate the underlying buffer.
      return new Float32Array(data);
    };
  })();

  loaded.set(modelId, promise);
  return promise;
}

/** Higher-level: load + time + catch errors, returning a result
 *  the background can JSON-serialize. */
export async function loadModelAndReport(
  modelId: ModelId
): Promise<LoadResult> {
  const t0 = performance.now();
  try {
    await loadModel(modelId);
    return { ok: true, modelId, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return {
      ok: false,
      modelId,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Embed a single text using an already-loaded model. Throws
 *  if the model hasn't been loaded. */
export async function embedText(
  modelId: ModelId,
  text: string
): Promise<Float32Array> {
  const embedder = await loadModel(modelId);
  return embedder(text);
}

/** Test-only: drop the cached model so the next call re-loads. */
export function _resetModelCache(): void {
  loaded.clear();
}
