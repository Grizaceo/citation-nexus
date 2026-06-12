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
  // Stack of currently-open sentence wrappers. Keyword spans are
  // terminal (they contain their own text via textContent) and never
  // get pushed. So a single open wrapper at any time is enough, but
  // we keep a stack for correctness in case of future wrapper kinds.
  const openStack: { span: Span; el: HTMLElement }[] = [];

  function emitText(target: Node, start: number, end: number) {
    if (end <= start) return;
    target.appendChild(document.createTextNode(text.slice(start, end)));
  }

  function currentContainer(): Node {
    if (openStack.length === 0) return frag;
    return openStack[openStack.length - 1]!.el;
  }

  for (const sp of spans) {
    // Close any open wrapper whose range has been fully passed.
    while (openStack.length > 0 && sp.start >= openStack[openStack.length - 1]!.span.end) {
      openStack.pop();
    }

    const target = currentContainer();
    // Emit any gap text from cursor to sp.start into the current
    // container. This is what fills the sentence wrapper with the
    // prose surrounding the keyword highlights.
    emitText(target, cursor, sp.start);

    if (sp.className === SENT_CLASS) {
      // Sentence wrapper: transparent container. Create the <mark>,
      // push it, and DO NOT advance the cursor (so the next emission
      // goes inside it, starting at sp.start).
      const el = document.createElement("mark");
      el.className = sp.className;
      target.appendChild(el);
      openStack.push({ span: sp, el });
      cursor = sp.start;
    } else {
      // Keyword highlight: terminal. Set its textContent and advance
      // cursor past it.
      const el = document.createElement("span");
      el.className = sp.className;
      if (sp.tooltip) el.setAttribute(TOOLTIP_ATTR, sp.tooltip);
      el.textContent = text.slice(sp.start, sp.end);
      target.appendChild(el);
      cursor = sp.end;
    }
  }

  // Emit any trailing text into the current container (the deepest
  // open wrapper, or the root fragment if none). Do this BEFORE
  // popping the stack so the trailing prose goes inside the last
  // sentence wrapper, not beside it.
  emitText(currentContainer(), cursor, text.length);

  // Close any remaining open wrapper.
  while (openStack.length > 0) openStack.pop();

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
