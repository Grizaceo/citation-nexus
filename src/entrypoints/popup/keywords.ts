// Citation Nexus — popup keywords section
//
// Owns the "Show keyword highlights" toggle. When ON, the content
// script emits per-category keyword highlight spans in the page
// (the bright colorful boxes). When OFF (default), only the
// subtle sentence wrapper renders, so diagonal reading stays
// clean. Citation IDs still appear in the popup; the [Download
// PDF] action still works — the keyword is just not visually
// highlighted.
//
// The content script listens to the same KEYWORDS_KEY and re-scans
// on change, so the toggle takes effect immediately on every
// active tab. We also listen to chrome.storage.onChanged so changes
// from DevTools or the content script itself re-render the toggle.

import { KEYWORDS_KEY } from "./state";

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
