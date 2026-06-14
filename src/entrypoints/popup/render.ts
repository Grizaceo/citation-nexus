// Citation Nexus — popup render module
//
// Owns the popup's main DOM rendering surface:
//   - setSub: status subtitle under the <h1>
//   - paintPopup: top-level "stats + categories + findings list"
//     painter, called on every loadTab() (1Hz) and CITATIONS_UPDATE
//   - renderFindingRow: per-finding row with [Copy] / [Open] / [Save]
//     buttons. [Save] sends DOWNLOAD_PAPER to the background which
//     routes to the native host.
//
// Reused by main.ts (setSub is called from loadTab, paintPopup from
// loadTab; renderFindingRow stays internal to this file).
//
// The download/save flow lives here because the row is the only
// place that renders the action button. The pop-up-level "Rescan"
// / "Options" wiring stays in main.ts.

import { getDownloadUrl } from "@/lib/download";
import { getDownloadInfo } from "@/patterns/downloader";
import type { Finding } from "@/patterns/core";
import { MSG, state, type TabState } from "./state";

/** Update the subtitle under the <h1> ("Scanning…", the page
 *  title, error states, etc). */
export function setSub(text: string): void {
  const el = document.getElementById("nx-sub");
  if (el) el.textContent = text;
}

/** Paint the popup's main view: total stat, category chips, and the
 *  per-finding list. Skipped if the count is unchanged from the
 *  last paint to avoid losing focus / scroll on a noisy poll. */
export function paintPopup(tabState: TabState): void {
  const findings = tabState.findings ?? [];
  setSub(tabState.title || tabState.url || "Active tab");

  document.getElementById("nx-stat-total")!.textContent = String(findings.length);

  // Same count as before? Skip the heavy DOM rebuild to avoid
  // losing focus / scroll on a noisy poll.
  if (findings.length === state.lastFindingsCount) return;
  state.lastFindingsCount = findings.length;

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
