// Citation Nexus — Embedding model registry
//
// Metadata for the ONNX-quantized sentence-transformer models the
// extension knows about. The actual model files are bundled in the
// extension as static assets (Option A — offline-ready, no first-run
// download). The background script lazy-loads them on demand when
// the user picks one from the popup's "Embeddings" dropdown.
//
// Each entry mirrors a Xenova/HuggingFace ONNX-quantized model. The
// `url` is a chrome.runtime.getURL() relative path (resolved at
// load time) — the model files live under .output/chrome-mv3/
// after `npm run build`.

export type ModelId = "multilingual" | "scholar" | "keywords";

export interface ModelMeta {
  id: ModelId;
  /** Label shown in the popup's dropdown. */
  displayName: string;
  /** Approximate on-disk size after int8 quantization. */
  sizeBytes: number;
  /** Embedding dimensionality. 384 is the MiniLM family default. */
  dimensions: number;
  /** ISO 639-1 codes the model handles natively. The multilingual
   *  one is "all 50+" — we list the ones we dogfood against. */
  languages: string[];
  /** Free-text description for the options UI. */
  description: string;
  /** chrome.runtime.getURL() relative path to the ONNX folder. */
  onnxPath: string;
}

/**
 * v1: only "multilingual" is shipped. Scholar and keywords are
 * v2 — the user picks "multilingual" for 95% of use cases and
 * we can add more later without changing the dropdown UI.
 */
export const MODELS: Record<ModelId, ModelMeta | null> = {
  multilingual: {
    id: "multilingual",
    displayName: "Multilingual",
    sizeBytes: 25 * 1024 * 1024, // ~25 MB int8 quantized
    dimensions: 384,
    // 50+ languages per the upstream model card. We list the ones
    // we dogfood against in the citation-nexus goldset.
    languages: [
      "ar", "bg", "ca", "cs", "da", "de", "el", "en", "es", "et",
      "fa", "fi", "fr", "gl", "gu", "he", "hi", "hr", "hu", "hy",
      "id", "it", "ja", "ka", "ko", "ku", "lt", "lv", "mk", "ml",
      "mr", "ms", "my", "nb", "nl", "pl", "pt", "ro", "ru", "sk",
      "sl", "sq", "sr", "sv", "th", "tr", "uk", "ur", "vi", "zh",
    ],
    description:
      "paraphrase-multilingual-MiniLM-L12-v2, int8 quantized. " +
      "Good for keywords and short phrases in 50+ languages.",
    // Model is bundled as a static asset. After `npm run build`,
    // it lives under .output/chrome-mv3/assets/models/multilingual/
    // The exact path is configured in wxt.config.ts.
    onnxPath: "assets/models/multilingual/",
  },
  // v2 — academic-specific SPECTER2. ~110MB int8, EN only.
  scholar: null,
  // v2 — fastText word vectors. ~60MB, 157 languages, keyword-only.
  keywords: null,
};

/** Returns the list of model options the popup should render. */
export function listAvailableModels(): ModelMeta[] {
  const out: ModelMeta[] = [];
  for (const m of Object.values(MODELS)) {
    if (m) out.push(m);
  }
  return out;
}
