// Citation Nexus — Content-script scan runner
// Pure function that performs one scan-and-render cycle. Extracted
// from content.ts so the scan logic can be unit-tested without a
// real DOM MutationObserver / setTimeout environment.

import { applyPatterns, PatternRegistry } from "@/patterns/registry";
import { renderHighlights } from "@/patterns/highlight";
import type { Finding } from "@/patterns/core";

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

export interface ScanOptions {
  /**
   * When false (default), only the sentence wrapper renders. Keyword
   * highlight spans are not emitted at all — the page stays quiet
   * for diagonal reading. When true, the bright per-category
   * keyword highlights are rendered too.
   */
  showKeywords: boolean;
}

export function runScanCycle(
  root: Node,
  registry: PatternRegistry,
  page: PageInfo,
  send: (msg: ScanMessage) => void,
  options: ScanOptions = { showKeywords: false }
): number {
  const findings = applyPatterns(root, registry);
  // Only text-body findings are highlightable. Meta-tag and
  // JSON-LD findings are metadata; they appear in the popup but
  // the visual highlighter skips them. The `showKeywords` flag
  // toggles whether keyword highlight spans are emitted at all
  // (sentence wrappers are always rendered).
  renderHighlights(findings, { showKeywords: options.showKeywords });
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
