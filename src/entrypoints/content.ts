// Citation Nexus — Content Script
// Scans the active page, applies registered PatternSets, highlights matches,
// and reports them to the background worker. Re-runs on SPA mutations.

import "@/assets/content.css";
import { getDefaultRegistry } from "@/patterns/registry";
import { runScanCycle } from "@/lib/content-runner";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main(ctx) {
    // WXT's IIFE wrapper at the bottom of the bundle re-throws any
    // synchronous error from main() up to the page console. To make
    // sure the user never sees an "Uncaught" error here — including
    // the noisy "Extension context invalidated" race when the
    // extension is reloaded mid-page — we wrap the whole body in
    // a top-level try/catch that swallows everything. The visual
    // highlight side-effects (applyPatterns, renderHighlights) are
    // independent of the messaging path, so a failure there just
    // means no findings reach the popup; the page still gets its
    // highlights.
    try {
      const registry = getDefaultRegistry();
      const page = { url: location.href, title: document.title };

      // While we're rendering, ignore observer-triggered re-scans.
      // The MutationObserver fires on ANY DOM mutation including the
      // ones we make (replacing text nodes with mark/span fragments).
      // Without this guard, each render spawns another observer
      // tick, which re-scans, which re-renders, ad infinitum —
      // visible as "StatStatStatStat..." on the page.
      let isRendering = false;

      function runScan() {
        // When the extension is reloaded, the content script's
        // chrome.runtime context is invalidated: chrome.runtime.id
        // becomes null and any further sendMessage throws "Extension
        // context invalidated". Skip the whole run in that case —
        // a fresh content script from the new build will replace us
        // on the next page load.
        if (!chrome.runtime?.id) return;
        isRendering = true;
        try {
          runScanCycle(document.body, registry, page, (msg) => {
            // Same guard at the call site: sendMessage is the actual
            // thing that throws, and we want to swallow any race
            // between the runtime.id check and the call.
            if (!chrome.runtime?.id) return;
            try {
              chrome.runtime.sendMessage(msg);
            } catch {
              // Context went away mid-call. Nothing to do — a newer
              // content script will be in charge soon.
            }
          });
        } finally {
          // Wait a tick so the observer's own-trigger fires (and is
          // ignored) before we re-enable.
          ctx.setTimeout(() => {
            isRendering = false;
          }, 100);
        }
      }

      // First pass: scan whatever's in the DOM at document_idle.
      runScan();

      // Second pass: SPAs (YouTube, Reddit, arxiv) often inject
      // content *after* document_idle. A 2s timer catches the most
      // common case. Use ctx.setTimeout so the timer is auto-cleared
      // if the context is invalidated (extension reload) — otherwise
      // the timer keeps firing against a dead runtime.
      ctx.setTimeout(runScan, 2000);

      // Third pass: MutationObserver for SPAs that mutate later
      // (e.g. arxiv's MathJax re-render, infinite scroll). We
      // debounce to avoid re-running on every keystroke. The
      // isRendering guard above prevents the self-trigger feedback
      // loop.
      let pending = false;
      const observer = new MutationObserver(() => {
        if (isRendering) return;
        if (!chrome.runtime?.id) return;
        if (pending) return;
        pending = true;
        ctx.setTimeout(() => {
          pending = false;
          runScan();
        }, 800);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Also re-scan on URL change (SPA route change).
      // ctx.setInterval auto-clears on context invalidation, so this
      // won't keep firing against a dead runtime after the extension
      // is reloaded.
      let lastUrl = location.href;
      ctx.setInterval(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          page.url = location.href;
          page.title = document.title;
          runScan();
        }
      }, 1000);
    } catch {
      // Top-level safety net. Never let an error in this content
      // script surface as "Uncaught" in the page console — the
      // WXT IIFE would otherwise re-throw it.
    }
  },
});
