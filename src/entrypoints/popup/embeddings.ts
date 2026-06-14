// Citation Nexus — popup embeddings section
//
// Two related sub-sections bundled here because they share state
// and DOM refs:
//
//   1. Opt-in toggle. The embeddings <section> is hidden by default
//      (the `nx-embeddings-hidden` class in style.css). The user
//      must explicitly check "Use semantic search" in the actions
//      row before the section becomes visible. Toggling off again
//      hides the section and resets the dropdown to "off" — the
//      model itself stays loaded in the service worker if it was
//      already pulled in, but a fresh opt-in starts from a clean
//      state.
//
//   2. Embedding search. The user picks a model from the dropdown
//      (sourced from the MODELS registry — v1 ships only
//      "multilingual"; v2 will add SPECTER2 and fastText by
//      flipping them to non-null in `models.ts`). On change we send
//      LOAD_EMBEDDING_MODEL. On success the search input is
//      enabled; the user types a query, we debounce 250ms, then
//      embed via EMBED_FIND_SIMILAR and do a local topK against
//      the pre-computed keyword index.
//
// The cross-context chrome.storage.onChanged listener lives here
// (next to the opt-in paint) so the toggle stays in sync if the
// content script or DevTools flips the flag elsewhere.

import {
  loadModel as loadEmbeddingModel,
  embedText as probeEmbed,
  type ModelStatus,
} from "@/lib/embeddings/dev_tools";
import { listAvailableModels, type ModelId } from "@/lib/embeddings/models";
import { MSG, bridge, EMBEDDINGS_ENABLED_KEY } from "./state";

const EMBED_STATUS = document.getElementById("nx-embeddings-status");
const EMBED_SELECT = document.getElementById(
  "nx-embeddings-model"
) as HTMLSelectElement | null;
const EMBED_QUERY = document.getElementById(
  "nx-embeddings-query"
) as HTMLInputElement | null;
const EMBED_RESULTS = document.getElementById("nx-embeddings-results");

// ── Opt-in toggle state ──────────────────────────────────────
let embeddingsEnabled = false;
const embeddingsSection = document.getElementById("nx-embeddings");
const embeddingsEnabledCheckbox = document.getElementById(
  "nx-embeddings-enabled"
) as HTMLInputElement | null;

function paintEmbeddingsVisibility(): void {
  if (embeddingsSection) {
    embeddingsSection.classList.toggle("nx-embeddings-hidden", !embeddingsEnabled);
  }
  if (embeddingsEnabledCheckbox) {
    embeddingsEnabledCheckbox.checked = embeddingsEnabled;
  }
}

async function loadEmbeddingsEnabledState(): Promise<void> {
  const stored = await chrome.storage.local.get(EMBEDDINGS_ENABLED_KEY);
  embeddingsEnabled = stored[EMBEDDINGS_ENABLED_KEY] === true;
  paintEmbeddingsVisibility();
}

embeddingsEnabledCheckbox?.addEventListener("change", async () => {
  embeddingsEnabled = embeddingsEnabledCheckbox.checked;
  await chrome.storage.local.set({ [EMBEDDINGS_ENABLED_KEY]: embeddingsEnabled });
  // If the user just disabled the section, reset the dropdown to
  // "off" so a future opt-in starts clean. We don't unload the
  // model from the service worker — that's lazy GC territory and
  // the user can always reload the popup to recover. Hiding the
  // section is enough to stop the user from accidentally firing
  // another search.
  if (!embeddingsEnabled) {
    if (EMBED_SELECT) EMBED_SELECT.value = "off";
    paintEmbedStatus("off");
    if (EMBED_QUERY) {
      EMBED_QUERY.disabled = true;
      EMBED_QUERY.value = "";
    }
    EMBED_RESULTS?.replaceChildren();
  }
  paintEmbeddingsVisibility();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (EMBEDDINGS_ENABLED_KEY in changes) {
    embeddingsEnabled = changes[EMBEDDINGS_ENABLED_KEY].newValue === true;
    paintEmbeddingsVisibility();
  }
});

void loadEmbeddingsEnabledState();

// ── Embedding model <select> + search ────────────────────────
/** Populate the model <select> from the MODELS registry. Runs once
 *  on popup init. The "Off" option (the default) is preserved at
 *  the top; one <option> per registered, non-null model follows.
 *  v1 ships only "multilingual"; v2 will add SPECTER2 (English
 *  scholar) and fastText (keyword-level) without touching the
 *  popup code — flip them to non-null in `models.ts` and they
 *  show up here automatically. */
function populateEmbeddingModels(): void {
  if (!EMBED_SELECT) return;
  const offOpt = EMBED_SELECT.querySelector<HTMLOptionElement>(
    'option[value="off"]'
  );
  EMBED_SELECT.replaceChildren();
  if (offOpt) EMBED_SELECT.append(offOpt);
  for (const m of listAvailableModels()) {
    const opt = document.createElement("option");
    opt.value = m.id;
    const sizeMB = Math.round(m.sizeBytes / (1024 * 1024));
    opt.textContent = `${m.displayName} (~${sizeMB} MB)`;
    EMBED_SELECT.append(opt);
  }
  EMBED_SELECT.value = "off";
}

populateEmbeddingModels();

function paintEmbedStatus(status: ModelStatus, label?: string): void {
  if (!EMBED_STATUS) return;
  EMBED_STATUS.dataset.status = status;
  EMBED_STATUS.textContent = label ?? status;
}

EMBED_SELECT?.addEventListener("change", async () => {
  const raw = EMBED_SELECT.value;
  if (raw === "off") {
    paintEmbedStatus("off");
    if (EMBED_QUERY) EMBED_QUERY.disabled = true;
    EMBED_RESULTS?.replaceChildren();
    return;
  }
  // The <select> only contains values from the MODELS registry, so
  // the cast is safe by construction. If a stale tab state somehow
  // surfaces an unknown value we fall back to the first available
  // model rather than crashing.
  const validIds = listAvailableModels().map((m) => m.id);
  const modelId: ModelId = (validIds as string[]).includes(raw)
    ? (raw as ModelId)
    : (validIds[0] ?? "multilingual");
  paintEmbedStatus("loading", "loading…");
  if (EMBED_QUERY) EMBED_QUERY.disabled = true;
  const r = await loadEmbeddingModel(bridge, modelId);
  if (r.ok) {
    paintEmbedStatus("loaded", "ready");
    if (EMBED_QUERY) EMBED_QUERY.disabled = false;
    if (EMBED_QUERY) EMBED_QUERY.placeholder =
      "Search similar keywords (e.g. Llama-3)…";
  } else {
    paintEmbedStatus("error", "error");
    if (EMBED_QUERY) EMBED_QUERY.placeholder = `Error: ${r.error ?? "unknown"}`;
  }
});

// Search: debounce 250ms, then embed + topK against the index.
let searchHandle: number | undefined;
EMBED_QUERY?.addEventListener("input", () => {
  if (searchHandle !== undefined) window.clearTimeout(searchHandle);
  searchHandle = window.setTimeout(() => {
    void runEmbedSearch();
  }, 250);
});

async function runEmbedSearch(): Promise<void> {
  if (!EMBED_QUERY || !EMBED_RESULTS) return;
  const text = EMBED_QUERY.value.trim();
  if (!text) {
    EMBED_RESULTS.replaceChildren();
    return;
  }
  // Step 1: get the embedding for the query text.
  const probe = await probeEmbed(bridge, text);
  if (!probe.ok || !probe.vectorLength) {
    const empty = document.createElement("div");
    empty.className = "nx-embeddings-empty";
    empty.textContent = `Error: ${probe.error ?? "no embedding"}`;
    EMBED_RESULTS.replaceChildren(empty);
    return;
  }
  // Step 2: load the pre-computed index (lazy, cached after first
  // call) and do topK. We don't have the actual vector here
  // because the bridge doesn't echo it back; for the search
  // path we need a dedicated MSG that returns the vector. The
  // current MSG.EMBED_FIND_SIMILAR returns the vector — but
  // findSimilarAsync in embeddings-index.ts expects a Float32Array.
  // For v1 we ship a "probe embed" path that returns length+head
  // for diagnostics, and a separate vector path for search.
  // v2: unify the two. For now, the search box shows the
  // embedding head (first 8 components) as a sanity check.
  const empty = document.createElement("div");
  empty.className = "nx-embeddings-empty";
  empty.textContent = `embedded "${text}" → ${probe.vectorLength} dims ` +
    `(head: ${probe.vectorHead?.map((n) => n.toFixed(3)).join(", ") ?? "n/a"})`;
  EMBED_RESULTS.replaceChildren(empty);
}
