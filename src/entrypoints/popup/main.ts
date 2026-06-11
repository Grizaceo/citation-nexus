// Citation Nexus — Popup
// Reads the active tab's findings from the background worker, shows counts
// per category, and offers Rescan / Options actions.

const MSG = {
  GET_TAB_CITATIONS: "GET_TAB_CITATIONS",
  REQUEST_SCAN: "REQUEST_SCAN",
};

interface TabFindings {
  url: string;
  title: string;
  findings: Array<{ patternId: string; category: string; text: string }>;
  scannedAt: number;
}

async function loadTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setSub("No active tab");
    return;
  }
  const res = await chrome.runtime.sendMessage({
    type: MSG.GET_TAB_CITATIONS,
    tabId: tab.id,
  });
  if (!res?.ok) {
    setSub("Background not ready");
    return;
  }
  const state = res.state as TabFindings;
  paintPopup(state);
}

function setSub(text: string): void {
  const el = document.getElementById("nx-sub");
  if (el) el.textContent = text;
}

function paintPopup(state: TabFindings): void {
  const findings = state.findings ?? [];
  setSub(state.title || state.url || "Active tab");

  document.getElementById("nx-stat-total")!.textContent = String(findings.length);

  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.category, (counts.get(f.category) ?? 0) + 1);

  const catEl = document.getElementById("nx-categories")!;
  catEl.innerHTML = "";
  for (const [cat, n] of counts) {
    const chip = document.createElement("span");
    chip.className = "nx-cat-chip";
    chip.dataset.cat = cat;
    chip.innerHTML = `<span class="nx-dot"></span> ${cat} · ${n}`;
    catEl.appendChild(chip);
  }

  const raw = document.getElementById("nx-raw")!;
  raw.textContent = findings
    .map((f) => `${f.category.padEnd(10)} ${f.patternId.padEnd(20)} ${f.text}`)
    .join("\n");
}

document.getElementById("nx-rescan")?.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: MSG.REQUEST_SCAN });
  // Reload popup after a tick
  setTimeout(loadTab, 300);
});

document.getElementById("nx-options")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadTab();
