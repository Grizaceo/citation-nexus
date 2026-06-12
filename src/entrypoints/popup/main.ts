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

import { getDownloadUrl, getDownloadLabel } from "@/lib/download";
import { getDownloadInfo } from "@/patterns/downloader";
import type { Finding } from "@/patterns/core";

const MSG = {
  GET_TAB_CITATIONS: "GET_TAB_CITATIONS",
  REQUEST_SCAN: "REQUEST_SCAN",
  COPY_FINDING: "COPY_FINDING",
  DOWNLOAD_PAPER: "DOWNLOAD_PAPER",
};

// Persisted in chrome.storage.local. The content script reads the
// same key before each scan and listens for changes. Toggling
// here takes effect within ~1s on every active tab.
const PAUSED_KEY = "nx.paused.v1";
// When true, the per-category keyword highlight spans are emitted
// in the page (the bright colorful boxes). Default false: only
// the subtle sentence wrapper renders, so diagonal reading
// stays clean. Citation IDs still appear in the popup; the
// [Download PDF] action still works — the keyword is just not
// visually highlighted.
const KEYWORDS_KEY = "nx.keywords.v1";

interface TabState {
  url: string;
  title: string;
  findings: Finding[];
  scannedAt: number;
}

let currentTabId: number | undefined;
let lastFindingsCount = -1;
let pollHandle: number | undefined;

// Cooldown for the auto-rescan. If the popup opens and finds an
// empty state (background service worker was suspended and the
// in-memory tabStates was wiped, or the content script never
// scanned), trigger a re-scan. The cooldown prevents an infinite
// loop on pages that genuinely have 0 findings.
let lastAutoRescanAt = 0;
const AUTO_RESCAN_COOLDOWN_MS = 30_000;

async function loadTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setSub("No active tab");
    return;
  }
  currentTabId = tab.id;
  const res = await chrome.runtime.sendMessage({
    type: MSG.GET_TAB_CITATIONS,
    tabId: tab.id,
  });
  if (!res?.ok) {
    setSub("Background not ready");
    return;
  }
  const state = res.state as TabState;
  paintPopup(state);

  // Empty state = the background has no findings for this tab. Two
  // common causes: (1) the content script hasn't scanned yet (page
  // just loaded), or (2) the service worker was suspended and the
  // in-memory tabStates map was wiped between the last scan and
  // this popup open. In both cases, a re-scan produces fresh state.
  // We don't re-scan on every poll — the 30s cooldown stops us
  // from looping on pages that legitimately have 0 findings.
  if (
    (state.findings ?? []).length === 0 &&
    Date.now() - lastAutoRescanAt > AUTO_RESCAN_COOLDOWN_MS
  ) {
    lastAutoRescanAt = Date.now();
    setSub("Scanning…");
    void chrome.runtime.sendMessage({ type: MSG.REQUEST_SCAN });
  }
}

function setSub(text: string): void {
  const el = document.getElementById("nx-sub");
  if (el) el.textContent = text;
}

function paintPopup(state: TabState): void {
  const findings = state.findings ?? [];
  setSub(state.title || state.url || "Active tab");

  document.getElementById("nx-stat-total")!.textContent = String(findings.length);

  // Same count as before? Skip the heavy DOM rebuild to avoid
  // losing focus / scroll on a noisy poll.
  if (findings.length === lastFindingsCount) return;
  lastFindingsCount = findings.length;

  // ── Category chips ──────────────────────────────────────────
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.category, (counts.get(f.category) ?? 0) + 1);

  const catEl = document.getElementById("nx-categories")!;
  catEl.replaceChildren();
  for (const [cat, n] of counts) {
    const chip = document.createElement("span");
    chip.className = "nx-cat-chip";
    chip.dataset.cat = cat;
    const dot = document.createElement("span");
    dot.className = "nx-dot";
    chip.append(dot, ` ${cat} · ${n}`);
    catEl.append(chip);
  }

  // ── Findings list (interactive) ─────────────────────────────
  const listEl = document.getElementById("nx-findings")!;
  listEl.replaceChildren();
  for (const f of findings) {
    listEl.append(renderFindingRow(f));
  }
}

function renderFindingRow(f: Finding): HTMLElement {
  const row = document.createElement("div");
  row.className = "nx-finding";
  row.dataset.cat = f.category;

  // Main text: the matched span (clipped to 80 chars for layout).
  const main = document.createElement("div");
  main.className = "nx-finding-main";
  const id = document.createElement("span");
  id.className = "nx-finding-id";
  id.textContent = `${f.category}.${f.patternId.split(".").pop()}`;
  const text = document.createElement("span");
  text.className = "nx-finding-text";
  text.textContent = f.text.length > 80 ? f.text.slice(0, 77) + "…" : f.text;
  main.append(id, text);

  // Actions: [Copy] always; [Download] when a URL is resolvable.
  const actions = document.createElement("div");
  actions.className = "nx-finding-actions";

  const copyBtn = document.createElement("button");
  copyBtn.className = "nx-mini-btn";
  copyBtn.textContent = "Copy";
  copyBtn.title = `Copy "${f.text}" to clipboard`;
  copyBtn.addEventListener("click", async () => {
    await navigator.clipboard.writeText(f.text);
    copyBtn.textContent = "Copied";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
  });
  actions.append(copyBtn);

  const url = getDownloadUrl(f);
  if (url) {
    const openBtn = document.createElement("button");
    openBtn.className = "nx-mini-btn";
    openBtn.textContent = "Open";
    openBtn.title = `Open ${url} in a new tab`;
    openBtn.addEventListener("click", () => {
      void chrome.tabs.create({ url });
    });
    actions.append(openBtn);
  }

  // [Save] button — appears only for high-confidence findings
  // (meta tag, JSON-LD, canonical link). The pure downloader
  // returns null for text-body matches (regla 'solo en las
  // certificadas'). On click, sends DOWNLOAD_PAPER to the
  // background which routes to the native host. The native host
  // fetches the URL and writes to the local vault.
  const saveInfo = getDownloadInfo(f);
  if (saveInfo) {
    const saveBtn = document.createElement("button");
    saveBtn.className = "nx-mini-btn nx-mini-btn-accent";
    saveBtn.textContent = "Save";
    saveBtn.title = `Download ${saveInfo.filename}.${saveInfo.format} to local vault`;
    saveBtn.addEventListener("click", async () => {
      const originalLabel = saveBtn.textContent;
      saveBtn.textContent = "Saving…";
      saveBtn.disabled = true;
      try {
        const res = await chrome.runtime.sendMessage({
          type: MSG.DOWNLOAD_PAPER,
          payload: saveInfo,
        });
        if (res?.ok && res.data?.ok) {
          const data = res.data as {
            path: string;
            size: number;
            skipped?: string;
          };
          if (data.skipped) {
            saveBtn.textContent = "Saved ✓";
            saveBtn.title = `Already exists: ${data.path}`;
          } else {
            saveBtn.textContent = "Saved ✓";
            const kb = Math.round(data.size / 1024);
            saveBtn.title = `${data.path} (${kb} KB)`;
          }
        } else {
          const err = res?.data?.error || res?.error || "unknown error";
          saveBtn.textContent = "Failed";
          saveBtn.title = err;
        }
      } catch (e) {
        saveBtn.textContent = "Failed";
        saveBtn.title = String(e);
      } finally {
        saveBtn.disabled = false;
        setTimeout(() => {
          if (saveBtn.textContent !== "Failed") {
            saveBtn.textContent = originalLabel;
          }
        }, 3000);
      }
    });
    actions.append(saveBtn);
  }

  row.append(main, actions);
  return row;
}

document.getElementById("nx-rescan")?.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: MSG.REQUEST_SCAN });
  // Force the next paint to refresh even if the count is the same.
  lastFindingsCount = -1;
  setTimeout(loadTab, 300);
});

document.getElementById("nx-options")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ── Show keywords toggle ──────────────────────────────────────
// Same pattern as the pause toggle. The content script listens
// to the same key and re-scans on change, so the toggle takes
// effect immediately on every active tab.
let showKeywords = false;
const keywordsCheckbox = document.getElementById(
  "nx-keywords"
) as HTMLInputElement | null;

function paintKeywords(): void {
  if (keywordsCheckbox) keywordsCheckbox.checked = showKeywords;
}

async function loadKeywordsState(): Promise<void> {
  const stored = await chrome.storage.local.get(KEYWORDS_KEY);
  showKeywords = stored[KEYWORDS_KEY] === true;
  paintKeywords();
}

keywordsCheckbox?.addEventListener("change", async () => {
  showKeywords = keywordsCheckbox.checked;
  await chrome.storage.local.set({ [KEYWORDS_KEY]: showKeywords });
});

// Re-render the toggle if another context (DevTools, the
// content script itself) changes the key.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (KEYWORDS_KEY in changes) {
    showKeywords = changes[KEYWORDS_KEY].newValue === true;
    paintKeywords();
  }
});

void loadKeywordsState();

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
  lastAutoRescanAt = 0;
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
  if (pollHandle === undefined) {
    pollHandle = window.setInterval(() => {
      void loadTab();
    }, 1000);
  }
  // When the background receives a fresh CITATIONS_UPDATE, push
  // the new state into the popup. The listener is added once per
  // popup lifetime — popups are recreated on each open.
  chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (msg.type === "CITATIONS_UPDATE") {
      // Bypass the same-count optimization; the source is fresh.
      lastFindingsCount = -1;
      void loadTab();
    }
  });
}

startAutoRefresh();
loadTab();
