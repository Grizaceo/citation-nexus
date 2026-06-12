// Citation Nexus — Highlight rendering
// Two layers:
//   1. Sentence-level: every sentence (a run bounded by . ! ? or \n)
//      that contains at least one match is wrapped in <mark class="nx-sentence">.
//      This gives the diagonal-reader a visual block to scan for.
//   2. Keyword-level: the matched substring inside the sentence gets
//      a stronger highlight via <span class="nx-highlight nx-highlight-{cat}">.
//
// The two layers are non-overlapping DOM-wise: the sentence <mark> sits
// outside, the keyword <span> sits inside. CSS makes them visually
// distinct (subtle yellow for the sentence block, vibrant per-category
// color for the keyword).

import type { Finding } from "./core";

const CLASS_PREFIX = "nx-highlight";
const SENT_CLASS = "nx-sentence";
const TOOLTIP_ATTR = "data-nx-tip";

interface Span {
  /** source-relative start offset in the text value */
  start: number;
  /** exclusive end offset */
  end: number;
  /** DOM class(es) */
  className: string;
  /** optional tooltip text */
  tooltip?: string;
}

interface Sentence {
  start: number;
  end: number;
  text: string;
}

const SENTENCE_RE = null; // (formerly used a regex; switched to char-loop for decimal-safety)

/** A `.` is a decimal point only if the surrounding digit runs are
 *  short (1–2 before, 1–3 after). Long runs like "arXiv:2401.01234"
 *  or "version 1.2.3.4" are NOT decimals and the dot should split. */
function isDecimalContext(text: string, dotPos: number): boolean {
  let beforeLen = 0;
  for (let i = dotPos - 1; i >= 0 && /\d/.test(text.charAt(i)); i--) beforeLen++;
  let afterLen = 0;
  for (let i = dotPos + 1; i < text.length && /\d/.test(text.charAt(i)); i++) afterLen++;
  return beforeLen >= 1 && beforeLen <= 2 && afterLen >= 1 && afterLen <= 3;
}

/** Returns true if `pos` is a sentence boundary. A `.`, `!`, or `?` is
 *  a boundary only when it is NOT a decimal (e.g. 1.2) and the next
 *  non-whitespace char is uppercase, an opening quote/bracket, or end
 *  of string. */
function isBoundary(text: string, pos: number): boolean {
  const c = text.charAt(pos);
  if (c !== "." && c !== "!" && c !== "?") return false;
  if (c === "." && isDecimalContext(text, pos)) return false;
  let j = pos + 1;
  while (j < text.length && /\s/.test(text.charAt(j))) j++;
  if (j >= text.length) return true;
  const next = text.charAt(j);
  return /[A-Z(\["'¿]/.test(next);
}

export function findSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let sentStart = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c !== "." && c !== "!" && c !== "?") continue;
    if (!isBoundary(text, i)) continue;
    out.push({
      start: sentStart,
      end: i + 1,
      text: text.slice(sentStart, i + 1),
    });
    sentStart = i + 1;
  }
  if (sentStart < text.length) {
    out.push({
      start: sentStart,
      end: text.length,
      text: text.slice(sentStart),
    });
  }
  return out;
}

function buildSpanTree(
  text: string,
  findings: Finding[],
  sentences: Sentence[]
): Span[] {
  // Map findings to keyword spans.
  const keywordSpans: Span[] = findings.map((f) => ({
    start: f.start,
    end: f.end,
    className: `${CLASS_PREFIX} ${CLASS_PREFIX}-${f.category}`,
    tooltip: `${f.label}: ${f.text}`,
  }));

  // Map sentences to sentence spans, but only those that contain at
  // least one finding. We clip the sentence to skip leading/trailing
  // whitespace so the visible block hugs the text.
  const sentenceSpans: Span[] = [];
  for (const sent of sentences) {
    const hasMatch = findings.some(
      (f) => f.start >= sent.start && f.end <= sent.end
    );
    if (!hasMatch) continue;
    let s = sent.start;
    let e = sent.end;
    while (s < e && /\s/.test(text.charAt(s))) s++;
    while (e > s && /\s/.test(text.charAt(e - 1))) e--;
    if (e <= s) continue;
    sentenceSpans.push({ start: s, end: e, className: SENT_CLASS });
  }

  // Merge: sort all spans by start, then emit. Sentence spans are
  // outer; keyword spans are inner. We emit a flat list and let the
  // caller (renderToFragment) reconstruct nesting.
  return [...sentenceSpans, ...keywordSpans].sort(
    (a, b) => a.start - b.start || a.end - b.end
  );
}

function renderToFragment(
  text: string,
  spans: Span[]
): DocumentFragment {
  const frag = document.createDocumentFragment();
  let cursor = 0;
  type StackEntry = { span: Span; el: HTMLElement };
  const stack: StackEntry[] = [];

  for (const sp of spans) {
    // If sp is nested inside an active stack entry, close enough stack
    // so that the topmost covers it.
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      if (sp.start >= top.span.end) {
        // Close top: pop, and if there's still a parent, the parent
        // becomes the active append target again.
        stack.pop();
      } else if (sp.start >= top.span.start && sp.end <= top.span.end) {
        break; // nested
      } else {
        // Out of order or overlapping. Just pop and continue.
        stack.pop();
      }
    }

    // Emit any text from cursor up to sp.start, attached to the current
    // top-of-stack element (or the fragment root).
    const topEntry = stack[stack.length - 1];
    const target: Node = topEntry ? topEntry.el : frag;
    const localCursor = cursor;
    if (sp.start > localCursor) {
      target.appendChild(
        document.createTextNode(text.slice(localCursor, sp.start))
      );
    }

    const el = document.createElement(
      sp.className === SENT_CLASS ? "mark" : "span"
    );
    el.className = sp.className;
    if (sp.tooltip) el.setAttribute(TOOLTIP_ATTR, sp.tooltip);
    target.appendChild(el);
    stack.push({ span: sp, el });
    cursor = sp.end;
  }

  // Close any remaining stack.
  while (stack.length > 0) stack.pop();

  // Emit trailing text.
  if (cursor < text.length) {
    frag.appendChild(document.createTextNode(text.slice(cursor)));
  }
  return frag;
}

export function renderHighlights(findings: Finding[]): void {
  if (findings.length === 0) return;
  // Group by source text node so each node is replaced at most once.
  const byNode = new Map<Text, Finding[]>();
  for (const f of findings) {
    const arr = byNode.get(f.node) ?? [];
    arr.push(f);
    byNode.set(f.node, arr);
  }

  for (const [text, list] of byNode) {
    const value = text.nodeValue ?? "";
    if (!value) continue;
    const sentences = findSentences(value);
    const spans = buildSpanTree(value, list, sentences);
    if (spans.length === 0) continue;
    const frag = renderToFragment(value, spans);
    const parent = text.parentNode;
    if (!parent) continue;
    parent.replaceChild(frag, text);
  }
}
