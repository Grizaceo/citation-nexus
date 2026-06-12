// Citation Nexus — Pattern registry
// Compiles PatternDefs into regexes, applies them to text (pure or DOM),
// resolves overlaps, and applies context disqualifiers.

import type {
  Category,
  CompiledPattern,
  Finding,
  Falsifier,
  MatchContext,
  PatternDef,
  PatternSet,
  PureFinding,
} from "./core";
import { citationsSet } from "./sets/citations";
import { scienceSet } from "./sets/science";
import { scanAllSources } from "./sources";

/** PatternDef with the regex compiled. */
interface InternalPattern extends CompiledPattern {
  excludeInSentence: string[];
  /** Resolved falsifier list (falsifiers + a synthetic one for the
   *  deprecated `excludeInSentence`, for back-compat). */
  falsifiers: Falsifier[];
}

export class PatternRegistry {
  private compiled: InternalPattern[] = [];
  register(set: PatternSet): void {
    for (const p of set.patterns) this.compiled.push(compile(p));
  }
  all(): InternalPattern[] {
    return this.compiled.slice();
  }
  byCategory(c: Category): InternalPattern[] {
    return this.compiled.filter((p) => p.category === c);
  }
}

function compile(p: PatternDef): InternalPattern {
  const flags = p.flags ?? "g";
  // Merge explicit falsifiers with a synthetic one when the legacy
  // `excludeInSentence` is set, so old pattern definitions keep
  // working unchanged.
  const falsifiers: Falsifier[] = [
    ...(p.falsifiers ?? []),
    ...(p.excludeInSentence && p.excludeInSentence.length > 0
      ? [{ context: p.excludeInSentence } satisfies Falsifier]
      : []),
  ];
  return {
    id: p.id,
    label: p.label,
    category: p.category,
    priority: p.priority ?? 0,
    tooltip: p.tooltip,
    re: new RegExp(p.regex, flags),
    excludeInSentence: p.excludeInSentence ?? [],
    falsifiers,
  };
}

/** Convenience: register the canonical citation + science sets and
 *  return a ready-to-scan registry. Used by the content script, the
 *  CLI batch scanner, and tests. */
export function getDefaultRegistry(): PatternRegistry {
  const r = new PatternRegistry();
  r.register(citationsSet);
  r.register(scienceSet);
  return r;
}

/**
 * Pure, DOM-free scan: applies every registered pattern to a single string
 * and returns non-overlapping findings.
 */
export function applyPatternsToText(
  text: string,
  registry: PatternRegistry
): PureFinding[] {
  const patterns = registry.all();
  const local: PureFinding[] = [];
  for (const p of patterns) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text)) !== null) {
      if (m[0].length === 0) {
        p.re.lastIndex++;
        continue;
      }
      const captured = m.length > 1 && m[1] !== undefined ? m[1] : m[0];
      const offset = captured !== m[0] ? m[0].indexOf(captured) : 0;
      const start = m.index + offset;
      const end = start + captured.length;

      // Quick-reject via falsifiers (pure, text-only — no DOM
      // context available in the pure path). The full DOM-context
      // check (parent, confidence, etc.) happens in `applyPatterns`.
      const ctx: MatchContext = {
        text,
        start,
        end,
        confidence: 0.7,
      };
      if (p.falsifiers.length > 0 && anyFalsifierMatches(p.falsifiers, ctx)) {
        continue;
      }

      local.push({
        patternId: p.id,
        category: p.category,
        label: p.label,
        text: captured,
        start,
        end,
        originalLength: m[0].length,
        priority: p.priority ?? 0,
        source: "text",
        confidence: ctx.confidence,
      });
    }
  }
  return resolveOverlaps(local);
}

/**
 * Returns true if the sentence containing the [start, end) span in
 * `text` contains any of the disqualifying words (case-insensitive,
 * word-boundary). The sentence is detected with the same
 * decimal-aware + abbreviation-aware algorithm used for sentence
 * wrapping in the highlighter.
 */
function sentenceContainsAny(
  text: string,
  start: number,
  end: number,
  words: string[]
): boolean {
  if (words.length === 0) return false;
  const sentences = findSentencesForContext(text);
  const containing = sentences.find((s) => start >= s.start && end <= s.end);
  if (!containing) return false;
  const haystack = containing.text.toLowerCase();
  for (const w of words) {
    if (wordInText(w.toLowerCase(), haystack)) return true;
  }
  return false;
}

/** True if any falsifier in the list matches the given context. */
export function anyFalsifierMatches(
  falsifiers: Falsifier[],
  ctx: MatchContext
): boolean {
  for (const f of falsifiers) {
    if (runFalsifier(f, ctx)) return true;
  }
  return false;
}

/** Evaluate a single falsifier against a match context. Exported
 *  so the test suite can call it directly without going through
 *  the full apply path. */
export function runFalsifier(
  f: Falsifier,
  ctx: MatchContext
): boolean {
  if ("context" in f) {
    return sentenceContainsAny(ctx.text, ctx.start, ctx.end, f.context);
  }
  if ("before" in f) {
    // Look at the up-to-100 chars immediately before the match.
    const before = ctx.text.slice(Math.max(0, ctx.start - 100), ctx.start);
    return matchPattern(f.before, before);
  }
  if ("after" in f) {
    const after = ctx.text.slice(ctx.end, Math.min(ctx.text.length, ctx.end + 100));
    return matchPattern(f.after, after);
  }
  if ("parent" in f) {
    if (!ctx.parent || ctx.parent.nodeType !== 1 /* ELEMENT_NODE */) return false;
    const el = ctx.parent as Element;
    if (f.parent.tag && el.tagName.toUpperCase() !== f.parent.tag.toUpperCase()) {
      return false;
    }
    if (f.parent.class && !el.classList.contains(f.parent.class)) {
      return false;
    }
    // Both `tag` and `class` (if specified) matched.
    return true;
  }
  if ("confidenceBelow" in f) {
    return ctx.confidence < f.confidenceBelow;
  }
  // Exhaustiveness check: TypeScript will flag this if a new
  // Falsifier variant is added without updating this function.
  const _exhaustive: never = f;
  return _exhaustive;
}

function matchPattern(p: string | RegExp, text: string): boolean {
  // Strip trailing whitespace from the slice. The natural user
  // intent for `before: "version"` is "the last WORD before the
  // match is version", not "the slice ends exactly with the
  // characters 'version' at the character boundary". Whitespace
  // at the boundary is implicit.
  const trimmed = text.replace(/\s+$/, "");
  if (typeof p === "string") {
    return trimmed.toLowerCase().endsWith(p.toLowerCase());
  }
  return new RegExp(p.source, p.flags.replace("g", "")).test(trimmed);
}

function wordInText(word: string, haystack: string): boolean {
  let from = 0;
  while (from <= haystack.length - word.length) {
    const i = haystack.indexOf(word, from);
    if (i < 0) break;
    const before = i === 0 || !/[a-z0-9]/.test(haystack.charAt(i - 1));
    const afterOk =
      i + word.length === haystack.length ||
      !/[a-z0-9]/.test(haystack.charAt(i + word.length));
    if (before && afterOk) return true;
    from = i + 1;
  }
  return false;
}

/**
 * Minimal sentence-detection for the context-disqualifier. Kept here
 * (instead of imported from highlight.ts) to avoid a circular import:
 * highlight.ts already depends on this file via core. Algorithm is
 * identical to highlight.findSentences — decimal-aware + Dr./Mr./Fig./
 * e.g.-aware. If the two implementations drift, the disqualifier
 * might disagree with the visual wrap on edge cases, but the
 * disqualifier is a guard, not a render boundary, so that's OK.
 */
function findSentencesForContext(
  text: string
): Array<{ start: number; end: number; text: string }> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  let sentStart = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c !== "." && c !== "!" && c !== "?") continue;
    // decimal-context guard (1-2 digits before, 1-3 after).
    if (c === ".") {
      let beforeLen = 0;
      for (let j = i - 1; j >= 0 && /\d/.test(text.charAt(j)); j--) beforeLen++;
      let afterLen = 0;
      for (let j = i + 1; j < text.length && /\d/.test(text.charAt(j)); j++) afterLen++;
      if (beforeLen >= 1 && beforeLen <= 2 && afterLen >= 1 && afterLen <= 3) {
        continue;
      }
    }
    // abbreviation guard.
    if (c === "." && isAbbreviation(text, i)) continue;
    let j = i + 1;
    while (j < text.length && /\s/.test(text.charAt(j))) j++;
    if (j >= text.length) {
      out.push({ start: sentStart, end: i + 1, text: text.slice(sentStart, i + 1) });
      sentStart = i + 1;
      continue;
    }
    const next = text.charAt(j);
    if (/[A-Z(\["'¿]/.test(next)) {
      out.push({ start: sentStart, end: i + 1, text: text.slice(sentStart, i + 1) });
      sentStart = i + 1;
    }
  }
  if (sentStart < text.length) {
    out.push({ start: sentStart, end: text.length, text: text.slice(sentStart) });
  }
  return out;
}

const ABBREVIATIONS = new Set([
  "Dr", "Mr", "Mrs", "Ms", "Prof", "Sr", "Jr", "St", "Gen",
  "Fig", "Eq", "No", "Vol", "Sec", "Ch", "Art", "Ref", "pp", "p",
  "Inc", "Co", "Corp", "Ltd",
  "al", "vs", "etc", "cf", "ca", "e", "i",
]);

function isAbbreviation(text: string, dotPos: number): boolean {
  let wordStart = dotPos - 1;
  while (wordStart > 0 && /[A-Za-z]/.test(text.charAt(wordStart - 1))) {
    wordStart--;
  }
  const word = text.substring(wordStart, dotPos);
  if (ABBREVIATIONS.has(word)) return true;
  if (word.length === 1 && /[A-Za-z]/.test(word)) {
    const beforeWord = wordStart > 0 ? text.charAt(wordStart - 1) : " ";
    if (!/[A-Za-z]/.test(beforeWord)) {
      let i = dotPos + 1;
      while (i < text.length && /\s/.test(text.charAt(i))) i++;
      if (i < text.length) {
        const next = text.charAt(i);
        if (/[A-Z]/.test(next)) return true;
        if (/[a-z]/.test(next) && (word === "e" || word === "i")) return true;
      }
    }
  }
  return false;
}

/**
 * DOM walker: visits every accepted text node under `root` and produces
 * Findings that carry a reference to their source text node (used by
 * the highlighter to wrap the right span in the page).
 *
 * Recurses into open shadow roots. Many modern sites (Reddit's
 * `<shreddit-post>`, GitHub's web components, parts of YouTube's
 * metadata) render their text inside custom elements that use open
 * shadow DOM. A plain `createTreeWalker(SHOW_TEXT)` does not cross
 * shadow boundaries, so text inside those roots was invisible to
 * earlier versions of this scanner. This recursive walker fixes
 * that. Closed shadow roots remain inaccessible (browser-enforced).
 */
export function applyPatterns(
  root: Node,
  registry: PatternRegistry
): Finding[] {
  const findings: Finding[] = [];

  walkTextNodes(root);

  // High-confidence sources: meta tags, JSON-LD, canonical link.
  // These are emitted with `node: <the meta element>` but the
  // highlighter filters out non-text sources. They appear in the
  // popup so the user can see "the publisher told us this is a DOI"
  // even when there's no in-body text to highlight.
  //
  // We always scan from `document` (or the root's ownerDocument)
  // so we catch `<meta>` tags in `<head>`, not just in `<body>`.
  const sourceRoot =
    root.ownerDocument ??
    (root as Document).defaultView?.document ??
    (globalThis as { document?: Document }).document ??
    root;
  const sourceFindings = scanAllSources(sourceRoot);
  for (const sf of sourceFindings) {
    findings.push({
      patternId: sf.patternId,
      category: sf.category,
      label: sf.label,
      text: sf.text,
      start: sf.start,
      end: sf.end,
      // Sentinel node; the highlighter filters by source.
      node: document.createTextNode(""),
      source: sf.source,
      confidence: sf.confidence,
    });
  }

  return findings;

  function walkTextNodes(node: Node): void {
    // ALSO have shadows, so this is recursive.
    if (node.nodeType === 1 /* ELEMENT_NODE */) {
      const el = node as Element;
      if (el.shadowRoot) {
        walkTextNodes(el.shadowRoot);
      }
    }
    // Direct text node — check the accept rules and emit findings.
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const text = node as Text;
      // Use parentNode (not parentElement) because a text node inside
      // a shadow root has a DocumentFragment parent whose
      // parentElement is null. Treating that as 'no parent' caused
      // shadow content to be silently skipped.
      const parent = text.parentNode;
      if (!parent) return;
      if (!acceptTextNode(text, parent)) return;
      const value = text.nodeValue ?? "";
      if (!value) return;
      const candidates = applyPatternsToText(value, registry);
      for (const f of candidates) {
        // DOM-aware falsifier check (parent tag/class). The pure
        // text-only checks already ran inside applyPatternsToText;
        // here we add the DOM-context half.
        const ctx: MatchContext = {
          text: value,
          start: f.start,
          end: f.end,
          parent,
          confidence: f.confidence ?? 0.7,
        };
        // The pattern that produced `f`:
        const p = registry.all().find((pp) => pp.id === f.patternId);
        if (p && anyFalsifierMatches(p.falsifiers, ctx)) continue;
        findings.push({
          patternId: f.patternId,
          category: f.category,
          label: f.label,
          text: f.text,
          start: f.start,
          end: f.end,
          node: text,
          source: "text",
          confidence: ctx.confidence,
        });
      }
      return;
    }
    // Otherwise recurse into children.
    const children = (node as ParentNode).childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child) walkTextNodes(child);
    }
  }

  return findings;
}

/**
 * Decide whether a text node should be scanned. The parent can be
 * either an Element (most cases) or a DocumentFragment (text node
 * directly under a shadow root). Both are accepted as long as the
 * text node isn't inside a <script>/<style>/our-own-wrapper.
 */
function acceptTextNode(text: Text, parent: Node): boolean {
  // Element parent: check tag and class lists.
  if (parent.nodeType === 1 /* ELEMENT_NODE */) {
    const el = parent as Element;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return false;
    if (
      el.classList.contains("nx-highlight") ||
      el.classList.contains("nx-sentence")
    ) {
      return false;
    }
  }
  // DocumentFragment parent (shadow root with a bare text child) or
  // element parent: just check the text content.
  if (!text.nodeValue || text.nodeValue.trim().length === 0) return false;
  return true;
}

function resolveOverlaps<
  T extends {
    start: number;
    end: number;
    originalLength?: number;
    priority?: number;
  }
>(items: T[]): T[] {
  if (items.length <= 1) return items;
  items.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const aLen = a.originalLength ?? a.end - a.start;
    const bLen = b.originalLength ?? b.end - b.start;
    if (aLen !== bLen) return bLen - aLen;
    const aP = a.priority ?? 0;
    const bP = b.priority ?? 0;
    if (aP !== bP) return bP - aP;
    return 0;
  });
  const out: T[] = [];
  let cursor = 0;
  for (const f of items) {
    if (f.start >= cursor) {
      out.push(f);
      cursor = f.end;
    }
  }
  return out;
}
