import { resolve } from "node:path";
import { defineConfig } from "wxt";
import { transformersWasmPlugin } from "./wxt-plugins/transformers-wasm";

export default defineConfig({
  srcDir: "src",
  alias: {
    "@": resolve("src"),
  },
  manifest: {
    name: "Citation Nexus",
    description:
      "Detect citations (arXiv, DOI, PubMed, GitHub) and English-language science concepts on web pages; highlight for diagonal reading; agentic bridge.",
    permissions: [
      "storage",
      "activeTab",
      "clipboardWrite",
      "scripting",
      "nativeMessaging",
    ],
    // host_permissions needed for @huggingface/transformers to
    // download model files and WASM runtime from the HF CDN
    // (and the official transformers.js JSDelivr mirror) on
    // first use. Without these, transformers.js falls back to
    // inlining the WASM as a base64 data URL, which balloons
    // the bundle by ~62 MB. With them, the SW lazily fetches
    // (~5-15 MB total) on first model load, then Chrome caches
    // it for subsequent popup opens.
    host_permissions: [
      "http://127.0.0.1:3002/*",
      "http://localhost:3002/*",
      "https://huggingface.co/*",
      "https://cdn.jsdelivr.net/*",
    ],
    action: {
      default_title: "Citation Nexus",
      default_icon: {
        "16": "icon-16.png",
        "32": "icon-32.png",
        "48": "icon-48.png",
        "128": "icon-128.png",
      },
    },
    icons: {
      "16": "icon-16.png",
      "32": "icon-32.png",
      "48": "icon-48.png",
      "128": "icon-128.png",
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
    // The web_accessible_resources list exposes the static
    // asset directory so the extension's own service worker can
    // fetch from chrome.runtime.getURL(). This is what the
    // embeddings-index.json path resolves to.
    web_accessible_resources: [
      {
        resources: ["assets/models/*", "assets/embeddings-index.json"],
        matches: ["<all_urls>"],
      },
    ],
  },
  // Critical for the embedding feature: do NOT inline large
  // assets (WASM, JSON > 4KB) as base64 data URLs. The
  // @huggingface/transformers library ships a 17 MB ONNX
  // runtime WASM that the bundler tries to inline by default,
  // turning the background.js into a 62 MB file. The
  // transformersWasmPlugin below extracts the WASM as a
  // separate asset and rewrites the data URL in the library
  // source to chrome.runtime.getURL(). Setting the
  // inlineLimit to 0 forces all assets to be extracted as
  // separate files under .output/chrome-mv3/assets/, which
  // the library then fetches at runtime.
  vite: () => ({
    plugins: [transformersWasmPlugin()],
    build: {
      assetsInlineLimit: 0,
    },
  }),
});
