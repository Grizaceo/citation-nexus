// Citation Nexus — Highlight rendering
// Wraps each Finding in a span with a category-specific CSS class. The spans
// are non-intrusive (inline, no layout shift) and expose a tooltip with
// pattern id and label.

import type { Finding } from "./core";

const CLASS_PREFIX = "nx-highlight";
const TOOLTIP_ATTR = "data-nx-tip";

export function renderHighlights(findings: Finding[]): void {
  // Group findings by source text node so we mutate each node at most once
  const byNode = new Map<Text, Finding[]>();
  for (const f of findings) {
    const arr = byNode.get(f.node) ?? [];
    arr.push(f);
    byNode.set(f.node, arr);
  }

  for (const [text, list] of byNode) {
    // Sort by start ascending
    list.sort((a, b) => a.start - b.start);
    const value = text.nodeValue ?? "";
    const fragments: (string | HTMLElement)[] = [];
    let cursor = 0;
    for (const f of list) {
      if (f.start < cursor) continue; // overlap already dropped upstream
      if (f.start > cursor) {
        fragments.push(value.slice(cursor, f.start));
      }
      const span = document.createElement("span");
      span.className = `${CLASS_PREFIX} ${CLASS_PREFIX}-${f.category}`;
      span.setAttribute(TOOLTIP_ATTR, `${f.label}: ${f.text}`);
      span.textContent = f.text;
      fragments.push(span);
      cursor = f.end;
    }
    if (cursor < value.length) {
      fragments.push(value.slice(cursor));
    }
    if (fragments.length === 0) continue;

    const parent = text.parentNode;
    if (!parent) continue;
    const frag = document.createDocumentFragment();
    for (const piece of fragments) {
      frag.appendChild(
        typeof piece === "string" ? document.createTextNode(piece) : piece
      );
    }
    parent.replaceChild(frag, text);
  }
}
