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
import type { Finding } from "@/patterns/core";

const MSG = {
  GET_TAB_CITATIONS: "GET_TAB_CITATIONS",
  REQUEST_SCAN: "REQUEST_SCAN",
  COPY_FINDING: "COPY_FINDING",
};

interface TabState {
  url: string;
  title: string;
  findings: Finding[];
  scannedAt: number;
}

let currentTabId: number | undefined;
let lastFindingsCount = -1;
let pollHandle: number | undefined;

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
    const dlBtn = document.createElement("button");
    dlBtn.className = "nx-mini-btn nx-mini-btn-accent";
    dlBtn.textContent = "Download";
    dlBtn.title = getDownloadLabel(f) ?? url;
    dlBtn.addEventListener("click", () => {
      // Open in a new tab; the popup stays open. We don't `await`
      // because chrome.tabs.create returns a Promise only in MV3
      // and we don't need the result.
      void chrome.tabs.create({ url });
    });
    actions.append(dlBtn);
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
