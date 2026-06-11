// Citation Nexus — Content Script
// Scans the active page, applies registered PatternSets, highlights matches,
// and reports them to the background worker. Re-runs on SPA mutations.

import "@/assets/content.css";
import { applyPatterns, getDefaultRegistry } from "@/patterns/registry";
import { renderHighlights } from "@/patterns/highlight";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    const registry = getDefaultRegistry();

    function runScan(root: Node = document.body) {
      const findings = applyPatterns(root, registry);
      renderHighlights(findings);
      // Send full findings to the background so the popup can break
      // down by category. The background's tabStates map keys by tabId.
      chrome.runtime.sendMessage({
        type: "CITATIONS_UPDATE",
        payload: {
          url: location.href,
          title: document.title,
          findings: findings.map((f) => ({
            patternId: f.patternId,
            category: f.category,
            text: f.text,
            start: f.start,
            end: f.end,
          })),
        },
      });
    }

    // First pass: scan whatever's in the DOM at document_idle.
    runScan();

    // Second pass: SPAs (YouTube, Reddit, arxiv) often inject content
    // *after* document_idle. A 2s timer catches the most common case.
    setTimeout(() => runScan(), 2000);

    // Third pass: MutationObserver for SPAs that mutate later (e.g.
    // arxiv's MathJax re-render, infinite scroll). We debounce to
    // avoid re-running on every keystroke.
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        runScan();
      }, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also re-scan on URL change (SPA route change).
    let lastUrl = location.href;
    const urlWatcher = setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        runScan();
      }
    }, 1000);
  },
});
