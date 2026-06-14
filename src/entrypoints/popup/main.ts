// Citation Nexus — Popup
// Reads the active tab's findings from the background worker, shows
// counts per category, and offers Rescan / Options actions. Per-
// finding actions: [Copy] and [Download] (where applicable).
//
// Auto-refreshes every second and listens for background updates to
// handle the case where the user opens the popup before the content
// script's first scan completes. The previous version loaded the
// state once and never updated, which caused the popup to show 0
// findings on pages where the content script was still mid-scan
// (notably YouTube, where the description loads after document_idle).

import { findSimilarAsync } from "@/lib/embeddings-index";
import {
  checkModelStatus,
  loadModel as loadEmbeddingModel,
  embedText as probeEmbed,
  formatStatus,
  type ModelStatus,
} from "@/lib/embeddings/dev_tools";
import { listAvailableModels, type ModelId } from "@/lib/embeddings/models";
import {
  MSG,
  bridge,
  PAUSED_KEY,
  EMBEDDINGS_ENABLED_KEY,
  AUTO_RESCAN_COOLDOWN_MS,
  type TabState,
  state,
} from "./state";
import { setSub, paintPopup } from "./render";
import "./keywords";

async function loadTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setSub("No active tab");
    return;
  }
  state.currentTabId = tab.id;
  const res = await chrome.runtime.sendMessage({
    type: MSG.GET_TAB_CITATIONS,
    tabId: tab.id,
  });
  if (!res?.ok) {
    setSub("Background not ready");
    return;
  }
  const tabState = res.state as TabState;
  paintPopup(tabState);

  // Empty state = the background has no findings for this tab. Two
  // common causes: (1) the content script hasn't scanned yet (page
  // just loaded), or (2) the service worker was suspended and the
  // in-memory tabStates map was wiped between the last scan and
  // this popup open. In both cases, a re-scan produces fresh state.
  // We don't re-scan on every poll — the 30s cooldown stops us
  // from looping on pages that legitimately have 0 findings.
  if (
    (tabState.findings ?? []).length === 0 &&
    Date.now() - state.lastAutoRescanAt > AUTO_RESCAN_COOLDOWN_MS
  ) {
    state.lastAutoRescanAt = Date.now();
    setSub("Scanning…");
    void chrome.runtime.sendMessage({ type: MSG.REQUEST_SCAN });
  }
}



document.getElementById("nx-rescan")?.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: MSG.REQUEST_SCAN });
  // Force the next paint to refresh even if the count is the same.
  state.lastFindingsCount = -1;
  setTimeout(loadTab, 300);
});

document.getElementById("nx-options")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ── Embeddings opt-in toggle ──────────────────────────────────
// The embeddings section is hidden by default (see the
// `nx-embeddings-hidden` class in style.css). The user must
// explicitly check "Use semantic search" in the actions row
// before the section becomes visible. Toggling off again hides
// the section and resets the dropdown to "off" — the model
// itself stays loaded in the service worker if it was already
// pulled in, but a fresh opt-in starts from a clean state.
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

// ── Pause / Resume toggle ─────────────────────────────────────
// Reads/writes the shared paused flag. The content script listens
// to the same flag via chrome.storage.onChanged and stops/starts
// scanning accordingly. Stored in chrome.storage.local so it
// survives service-worker suspension and is shared across popups.
let isPaused = false;

function paintStatus(): void {
  const status = document.getElementById("nx-status");
  const text = document.getElementById("nx-status-text");
  const btn = document.getElementById("nx-toggle");
  if (status) status.dataset.paused = String(isPaused);
  if (text) text.textContent = isPaused ? "Paused" : "Active";
  if (btn) {
    btn.textContent = isPaused ? "Resume" : "Pause";
    btn.title = isPaused ? "Click to resume scanning" : "Click to pause scanning";
  }
}

async function loadPausedState(): Promise<void> {
  const stored = await chrome.storage.local.get(PAUSED_KEY);
  isPaused = stored[PAUSED_KEY] === true;
  paintStatus();
}

document.getElementById("nx-toggle")?.addEventListener("click", async () => {
  isPaused = !isPaused;
  await chrome.storage.local.set({ [PAUSED_KEY]: isPaused });
  paintStatus();
  // Reset the auto-rescan cooldown so the new state is reflected
  // immediately (and so a manual toggle doesn't get clobbered by
  // a stale 'state is empty' check).
  state.lastAutoRescanAt = 0;
});

// React to changes from other contexts (DevTools tweaks, another
// popup, the content script itself).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (PAUSED_KEY in changes) {
    isPaused = changes[PAUSED_KEY].newValue === true;
    paintStatus();
  }
});

void loadPausedState();

// ── Auto-refresh + listener ────────────────────────────────────
// Re-poll every second while the popup is open. The popup context
// is destroyed when the user clicks away, so setInterval is
// cleaned up automatically.
function startAutoRefresh(): void {
  if (state.pollHandle === undefined) {
    state.pollHandle = window.setInterval(() => {
      void loadTab();
    }, 1000);
  }
  // When the background receives a fresh CITATIONS_UPDATE, push
  // the new state into the popup. The listener is added once per
  // popup lifetime — popups are recreated on each open.
  chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (msg.type === "CITATIONS_UPDATE") {
      // Bypass the same-count optimization; the source is fresh.
      state.lastFindingsCount = -1;
      void loadTab();
    }
  });
}

startAutoRefresh();
loadTab();

// ── Embeddings section (dropdown + search) ──────────────────
// The user picks a model from the dropdown. On change we send
// LOAD_EMBEDDING_MODEL. On success the search input is enabled;
// the user types a query, we embed it via EMBED_FIND_SIMILAR, and
// do a local topK against the pre-computed keyword index.

const EMBED_STATUS = document.getElementById("nx-embeddings-status");
const EMBED_SELECT = document.getElementById(
  "nx-embeddings-model"
) as HTMLSelectElement | null;
const EMBED_QUERY = document.getElementById(
  "nx-embeddings-query"
) as HTMLInputElement | null;
const EMBED_RESULTS = document.getElementById("nx-embeddings-results");

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

// ── Dev tools section (ad-hoc test utility) ──────────────────
// The user can verify the embedding pipeline end-to-end without
// having to install DevTools, switch to the service worker
// console, or write custom code. Each button is a one-liner over
// the bridge helpers in src/lib/embeddings/dev_tools.ts.
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
