// Citation Nexus — Content Script
// Scans the active page, applies registered PatternSets, highlights matches,
// and reports them to the background worker. Re-runs on SPA mutations.

import "@/assets/content.css";
import { getDefaultRegistry } from "@/patterns/registry";
import { runScanCycle } from "@/lib/content-runner";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    const registry = getDefaultRegistry();
    const page = { url: location.href, title: document.title };

    // While we're rendering, ignore observer-triggered re-scans. The
    // MutationObserver fires on ANY DOM mutation including the ones
    // we make (replacing text nodes with mark/span fragments). Without
    // this guard, each render spawns another observer tick, which
    // re-scans, which re-renders, ad infinitum — visible as
    // "StatStatStatStat..." on the page.
    let isRendering = false;

    function runScan() {
      isRendering = true;
      try {
        runScanCycle(document.body, registry, page, (msg) => {
          chrome.runtime.sendMessage(msg);
        });
      } finally {
        // Wait a tick so the observer's own-trigger fires (and is
        // ignored) before we re-enable.
        setTimeout(() => {
          isRendering = false;
        }, 100);
      }
    }

    // First pass: scan whatever's in the DOM at document_idle.
    runScan();

    // Second pass: SPAs (YouTube, Reddit, arxiv) often inject content
    // *after* document_idle. A 2s timer catches the most common case.
    setTimeout(runScan, 2000);

    // Third pass: MutationObserver for SPAs that mutate later (e.g.
    // arxiv's MathJax re-render, infinite scroll). We debounce to
    // avoid re-running on every keystroke. The isRendering guard above
    // prevents the self-trigger feedback loop.
    let pending = false;
    const observer = new MutationObserver(() => {
      if (isRendering) return;
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
        page.url = location.href;
        page.title = document.title;
        runScan();
      }
    }, 1000);
  },
});
