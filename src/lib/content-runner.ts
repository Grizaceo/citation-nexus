// Citation Nexus — Content-script scan runner
// Pure function that performs one scan-and-render cycle. Extracted
// from content.ts so the scan logic can be unit-tested without a
// real DOM MutationObserver / setTimeout environment.

import { applyPatterns, PatternRegistry } from "@/patterns/registry";
import { renderHighlights } from "@/patterns/highlight";

export interface PageInfo {
  url: string;
  title: string;
}

export interface ScanMessage {
  type: "CITATIONS_UPDATE";
  payload: {
    url: string;
    title: string;
    findings: Array<{
      patternId: string;
      category: string;
      text: string;
      start: number;
      end: number;
    }>;
  };
}

export function runScanCycle(
  root: Node,
  registry: PatternRegistry,
  page: PageInfo,
  send: (msg: ScanMessage) => void
): number {
  const findings = applyPatterns(root, registry);
  renderHighlights(findings);
  send({
    type: "CITATIONS_UPDATE",
    payload: {
      url: page.url,
      title: page.title,
      findings: findings.map((f) => ({
        patternId: f.patternId,
        category: f.category,
        text: f.text,
        start: f.start,
        end: f.end,
      })),
    },
  });
  return findings.length;
}
