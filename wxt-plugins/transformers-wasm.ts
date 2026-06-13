// Citation Nexus — Vite plugin: extract transformers.js WASM as asset
//
// THE PROBLEM
// @huggingface/transformers v3 ships the ONNX runtime WASM
// (~17 MB raw, ~22 MB base64) INLINED inside the library's
// source as a `data:application/wasm;base64,...` URL. When
// Vite/Rollup bundles the library, the WASM gets baked into
// the output JS, turning background.js into a 62 MB file.
//
// THE FIX
// At build time, find every `new URL(\`data:application/wasm;
// base64,...\`)` expression in the library source, decode the
// base64, emit each WASM as a Vite asset (so it lands as a
// separate file in .output/chrome-mv3/assets/), and replace
// the data URL with `chrome.runtime.getURL("assets/<filename>")`.
//
// The library's `locateFile` fallback chain is:
//   1. t.locateFile(filename, base) — if set, return whatever
//   2. base + filename  — relative path
//   3. new URL("data:...") — the inline fallback
// By replacing the data URL with an absolute chrome-extension
// URL, we make the runtime find the WASM at the extracted
// location. Step 3 never triggers.

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** Pattern matches the library's WASM fallback expression.
 *  Two variants exist across the onnxruntime-web distribution:
 *  - transformers.web.js:  new URL(`data:...`, u)
 *  - ort-wasm-simd-threaded.jsep.mjs:  new URL(`data:...`, ``+self.location.href)
 *  - ort.webgpu.bundle.min.mjs:  new URL(`data:...`, ``+self.location.href)
 *  We match all of them with a single greedy pattern that captures
 *  up to the matching `)` — independent of what's between. */
const WASM_DATA_URL_PATTERN =
  /new URL\(`data:application\/wasm;base64,([A-Za-z0-9+/=]+)`,[^`\n]{0,80}?\)/g;

/** Pattern matches the `new URL("ort-wasm-X.wasm", import.meta.url)`
 *  reference in the .mjs files. Vite resolves these at build time
 *  by reading the .wasm file and inlining it as a data URL — which
 *  is the 62 MB we're trying to avoid. We replace them with a
 *  `chrome.runtime.getURL(...)` call that Vite can't statically
 *  analyze, so it leaves the URL alone. The actual WASM file is
 *  emitted as a separate asset. */
const WASM_FILE_URL_PATTERN =
  /new URL\(("ort-wasm-[^"]*\.wasm"),\s*import\.meta\.url\)/g;

export function transformersWasmPlugin(): Plugin {
  return {
    name: "citation-nexus:transformers-wasm-extract",
    enforce: "pre",
    apply: "build",
    // We use the `load` hook (not `transform`) because Vite by
    // default does NOT run user-defined transforms on files
    // inside node_modules — it's an optimization to avoid
    // re-processing the same package source on every save. The
    // `load` hook is the supported escape hatch: it intercepts
    // before the file is read, and returning a string means
    // Vite uses that string as the file's source.
    load(id) {
      // Only intercept files that come from the transformers or
      // onnxruntime-web packages — both are part of the model's
      // dependency tree. The id looks like:
      //   /.../node_modules/@huggingface/transformers/dist/transformers.web.js
      //   /.../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs
      //   /.../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm
      if (
        !id.includes("@huggingface/transformers") &&
        !id.includes("onnxruntime-web")
      ) {
        return null;
      }

      // Debug: log every load that mentions these packages so
      // we can see which files pass through the filter.
      // eslint-disable-next-line no-console
      console.log(`[transformers-wasm] load() called for: ${id}`);

      // .wasm binaries: don't transform source, just emit them
      // as assets so the JS gets a URL reference, not the
      // 22 MB base64 data URL.
      if (id.endsWith(".wasm")) {
        const bytes = readFileSync(id);
        const filename = `ort-wasm-${id.split("/").pop()}`;
        this.emitFile({ type: "asset", name: filename, source: bytes });
        return `export default "";`;
      }

      // Read the file from disk (we're in the load hook, before
      // Vite's own transform).
      const source = readFileSync(id, "utf-8");
      let transformed = source;
      let replacedAny = false;

      // 1. Replace `new URL("ort-wasm-X.wasm", import.meta.url)`
      //    with `new URL(chrome.runtime.getURL("ort-wasm-X.wasm"))`.
      //    The original would be statically resolved by Vite to a
      //    data URL (because it points to a .wasm file in the same
      //    dir). The chrome.runtime.getURL() call is a runtime
      //    function Vite can't analyze, so it leaves the URL
      //    alone. We also read the actual .wasm file from disk and
      //    emit it as a separate asset so it lands in
      //    .output/chrome-mv3/assets/.
      WASM_FILE_URL_PATTERN.lastIndex = 0;
      const emittedBytes = new Map<string, number>(); // dedupe by name
      let m2: RegExpExecArray | null;
      while ((m2 = WASM_FILE_URL_PATTERN.exec(source)) !== null) {
        const wasmFilename = m2[1]!;
        // Quote stripping: the filename in source is quoted.
        const cleanName = wasmFilename.replace(/^"|"$/g, "");
        // Read the .wasm file from disk. It's in the same
        // directory as the .mjs source file (the import.meta.url
        // base).
        const wasmPath = id.replace(/\/[^/]+$/, `/${cleanName}`);
        // Strip the redundant `ort-wasm-` prefix for the
        // output name (cleaner filenames in assets/).
        const outName = `ort-wasm-${cleanName.replace(/^ort-wasm-/, "")}`;
        if (!emittedBytes.has(outName)) {
          try {
            const bytes = readFileSync(wasmPath);
            this.emitFile({ type: "asset", name: outName, source: bytes });
            emittedBytes.set(outName, bytes.length);
            // eslint-disable-next-line no-console
            console.log(
              `[transformers-wasm] emitted ${outName} ` +
                `(${Math.round(bytes.length / 1024)} KB)`
            );
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(
              `[transformers-wasm] could not read ${wasmPath}: ${String(e)}`
            );
          }
        }
        transformed = transformed.replace(
          m2[0],
          `new URL(chrome.runtime.getURL("assets/${outName}"))`
        );
        replacedAny = true;
      }

      // 2. Replace `new URL(\`data:application/wasm;base64,...\`,\s*\`\`)`
      //    with `chrome.runtime.getURL("assets/ort-wasm-N.wasm")`.
      //    The base64 is decoded and emitted as an asset; the source
      //    code keeps a reference via the chrome-extension URL.
      if (source.includes("data:application/wasm;base64,")) {
        WASM_DATA_URL_PATTERN.lastIndex = 0;
        let i = 0;
        while ((m2 = WASM_DATA_URL_PATTERN.exec(source)) !== null) {
          const base64 = m2[1]!;
          const bytes = Buffer.from(base64, "base64");
          const outName = `ort-wasm-inline-${i}.wasm`;
          if (!emittedBytes.has(outName)) {
            this.emitFile({ type: "asset", name: outName, source: bytes });
            emittedBytes.set(outName, bytes.length);
            // eslint-disable-next-line no-console
            console.log(
              `[transformers-wasm] emitted ${outName} ` +
                `(${Math.round(bytes.length / 1024)} KB) from inline base64`
            );
          }
          transformed = transformed.replace(
            m2[0],
            `chrome.runtime.getURL("assets/${outName}")`
          );
          i++;
        }
        replacedAny = true;
      }

      if (!replacedAny) return null;
      return transformed;
    },
  };
}
