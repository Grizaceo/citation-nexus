// Citation Nexus — Content Script
// Scans the active page, applies registered PatternSets, highlights matches,
// and reports them to the background worker.

import { applyPatterns, getDefaultRegistry } from "@/patterns/registry";
import { renderHighlights } from "@/patterns/highlight";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    const registry = getDefaultRegistry();
    const findings = applyPatterns(document.body, registry);
    renderHighlights(findings);

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
  },
});
