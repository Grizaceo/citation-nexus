// Citation Nexus — popup dev-tools section
//
// Ad-hoc test utility: lets the user verify the embedding pipeline
// end-to-end without installing Chrome DevTools, switching to the
// service worker console, or writing custom code. Each button is a
// one-liner over the bridge helpers in src/lib/embeddings/dev_tools.ts.
//
// The "Status" button checks the model load state. "Embed" embeds
// the probe word "Llama-3" and shows the vector head as a sanity
// check. "Find similar" runs the full end-to-end path: embed +
// load index + topK, dumping the first 5 entries so the user can
// verify the index is loaded.
//
// Self-registering (side-effect import from main.ts).

import { findSimilarAsync } from "@/lib/embeddings-index";
import {
  checkModelStatus,
  embedText as probeEmbed,
  formatStatus,
} from "@/lib/embeddings/dev_tools";
import { listAvailableModels } from "@/lib/embeddings/models";
import { MSG, bridge } from "./state";

const DEV_OUTPUT = document.getElementById("nx-devtools-output");

function devAppend(text: string): void {
  if (!DEV_OUTPUT) return;
  // Timestamp so consecutive runs are easy to compare.
  const ts = new Date().toISOString().slice(11, 19);
  DEV_OUTPUT.textContent = `[${ts}] ${text}\n\n${DEV_OUTPUT.textContent ?? ""}`.slice(0, 4000);
}

document
  .getElementById("nx-dev-status")
  ?.addEventListener("click", async () => {
    const r = await checkModelStatus(bridge);
    devAppend("status check:\n" + formatStatus(r));
  });

document
  .getElementById("nx-dev-embed")
  ?.addEventListener("click", async () => {
    const r = await probeEmbed(bridge, "Llama-3");
    if (r.ok) {
      devAppend(
        `embed "Llama-3" → ok\n` +
          `  vectorLength: ${r.vectorLength}\n` +
          `  vectorHead:   [${r.vectorHead?.map((n) => n.toFixed(4)).join(", ")}]`
      );
    } else {
      devAppend(`embed "Llama-3" → error\n  ${r.error ?? "unknown"}`);
    }
  });

document
  .getElementById("nx-dev-similar")
  ?.addEventListener("click", async () => {
    // Full end-to-end: embed + load index + topK. The find-similar
    // path is implemented via EMBED_FIND_SIMILAR + a local topK
    // call against the pre-computed index. For the dev tool we
    // also dump the index size + first 5 entries so the user can
    // verify the index is loaded.
    try {
      // Use the first available model from the registry rather
      // than hardcoding "multilingual" — when v2 ships SPECTER2
      // or fastText, the dev tool will follow the registry.
      const devModelId = listAvailableModels()[0]?.id ?? "multilingual";
      const res = (await bridge.sendMessage({
        type: MSG.EMBED_FIND_SIMILAR,
        payload: { text: "BERT", modelId: devModelId },
      })) as { ok?: boolean; error?: string; data?: { vector?: number[] } } | undefined;
      if (!res?.ok) {
        devAppend(`find-similar "BERT" → error\n  ${res?.error ?? "unknown"}`);
        return;
      }
      const vec = res.data?.vector;
      if (!vec) {
        devAppend(`find-similar "BERT" → no vector in response`);
        return;
      }
      const entries = await findSimilarAsync(new Float32Array(vec), 5);
      devAppend(
        `find-similar "BERT" → ok\n` +
          `  vectorLength: ${vec.length}\n` +
          `  top 5 from index:\n` +
          entries
            .map(
              (e, i) =>
                `  ${i + 1}. ${e.keyword.padEnd(28)} ${e.similarity.toFixed(4)}`
            )
            .join("\n")
      );
    } catch (e) {
      devAppend(`find-similar "BERT" → exception\n  ${String(e)}`);
    }
  });
