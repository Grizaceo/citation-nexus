// Citation Nexus — Pattern Registry
// Compiles PatternSets into a single in-memory registry, then exposes
// applyPatterns() to scan text (pure, no DOM) and applyPatternsToDom()
// to walk a DOM subtree.

import type {
  Category,
  CompiledPattern,
  Finding,
  PatternDef,
  PatternSet,
} from "./core";
import { citationsSet } from "./sets/citations";
import { scienceSet } from "./sets/science";

export class PatternRegistry {
  private compiled: CompiledPattern[] = [];

  register(set: PatternSet): void {
    for (const def of set.patterns) {
      this.compiled.push(compile(def));
    }
  }

  all(): CompiledPattern[] {
    return this.compiled.slice();
  }

  byCategory(cat: string): CompiledPattern[] {
    return this.compiled.filter((p) => p.category === cat);
  }
}

function compile(def: PatternDef): CompiledPattern {
  const flags = def.flags ?? "g";
  return {
    id: def.id,
    label: def.label,
    category: def.category,
    priority: def.priority ?? 0,
    tooltip: def.tooltip,
    re: new RegExp(def.regex, flags),
  };
}

export function getDefaultRegistry(): PatternRegistry {
  const r = new PatternRegistry();
  r.register(citationsSet);
  r.register(scienceSet);
  return r;
}

export interface PureFinding {
  patternId: string;
  category: Category;
  label: string;
  text: string;
  start: number;
  end: number;
  /** Full match length before any capture-group extraction. Used to
   *  break ties in overlap resolution (longer = more specific). */
  originalLength: number;
  /** Pattern priority. Higher wins on full ties (same start, same
   *  originalLength). Default 0. */
  priority: number;
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

      // Context disqualifier: if the pattern declares
      // `excludeInSentence` and the same sentence contains any of
      // those words, drop the finding. This is what makes
      // "55.2 km" not a match in an earthquake article (the sentence
      // contains "depth") but a real match in a particle-physics
      // paper.
      if (p.excludeInSentence && p.excludeInSentence.length > 0) {
        if (sentenceContainsAny(text, start, end, p.excludeInSentence)) {
          continue;
        }
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
 * wrapping in the highlighter — same source of truth for "what is
 * a sentence here".
 */
function sentenceContainsAny(
  text: string,
  start: number,
  end: number,
  words: string[]
): boolean {
  if (words.length === 0) return false;
  // Import lazily to avoid a circular import: highlight.ts already
  // depends on the registry (via core).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sentences = findSentencesForContext(text);
  const containing = sentences.find(
    (s) => start >= s.start && end <= s.end
  );
  if (!containing) return false;
  const haystack = containing.text.toLowerCase();
  for (const w of words) {
    const lw = w.toLowerCase();
    // Word-boundary check: \b in JS is ASCII-only, so do it by
    // index arithmetic to handle UTF-8 properly.
    let from = 0;
    while (from <= haystack.length - lw.length) {
      const i = haystack.indexOf(lw, from);
      if (i < 0) break;
      const before = i === 0 || !/[a-z0-9]/.test(haystack.charAt(i - 1));
      const afterOk =
        i + lw.length === haystack.length ||
        !/[a-z0-9]/.test(haystack.charAt(i + lw.length));
      if (before && afterOk) return true;
      from = i + 1;
    }
  }
  return false;
}

/** Re-exported here to keep the disqualifier co-located with the
 *  matching logic. Implementation lives at the bottom of this file
 *  to avoid a circular import with highlight.ts.
 */
declare function findSentencesForContext(text: string): Array<{
  start: number;
  end: number;
  text: string;
}>;

/**
 * DOM walker: visits every accepted text node under `root` and produces
 * Findings that carry a reference to their source text node (used by the
 * highlighter to wrap the right span in the page).
 */
export function applyPatterns(root: Node, registry: PatternRegistry): Finding[] {
  const findings: Finding[] = [];
  const doc = root.ownerDocument ?? (globalThis as { document?: Document }).document;
  if (!doc) {
    throw new Error("applyPatterns: no document available");
  }
  const walker = doc.createTreeWalker(root, 0x4 /* SHOW_TEXT */, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return 2;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
        return 2;
      // Skip text nodes already wrapped in our highlights or sentence
      // markers. Defense-in-depth against the re-scan feedback loop —
      // the content script also gates via an `isRendering` flag, but
      // if anything slips through we still don't double-wrap.
      if (
        parent.classList.contains("nx-highlight") ||
        parent.classList.contains("nx-sentence")
      )
        return 2;
      if (!node.nodeValue || node.nodeValue.trim().length === 0) return 2;
      return 1 /* FILTER_ACCEPT */;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    const value = text.nodeValue ?? "";
    if (!value) continue;
    const local: Finding[] = applyPatternsToText(value, registry).map(
      (f) =>
        ({
          patternId: f.patternId,
          category: f.category,
          label: f.label,
          text: f.text,
          start: f.start,
          end: f.end,
          node: text,
        }) as Finding
    );
    findings.push(...local);
  }
  return findings;
}

function resolveOverlaps<
  T extends { start: number; end: number; originalLength?: number; priority?: number }
>(items: T[]): T[] {
  if (items.length <= 1) return items;
  items.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const aLen = a.originalLength ?? a.end - a.start;
    const bLen = b.originalLength ?? b.end - b.start;
    if (aLen !== bLen) return bLen - aLen; // longer (more specific) wins
    // On full tie, higher-priority pattern wins.
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

// Provide findSentencesForContext for the context-disqualifier
// without creating a circular import. The highlight module already
// imports from this file (via core), so we re-implement just the
// bits we need here — a single function call, no shared state.
//
// (If the highlight module's algorithm drifts from this, the
// disqualifier might use ligeramente different sentence boundaries
// than the highlighter. That's acceptable: the disqualifier is
// a guard, not a render boundary.)
function findSentencesForContext(text: string): Array<{
  start: number;
  end: number;
  text: string;
}> {
  const out: Array<{ start: number; end: number; text: string }> = [];
  let sentStart = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (c !== "." && c !== "!" && c !== "?") continue;
    // decimal-context guard (1-2 digits before, 1-3 after) — same
    // rule as the highlighter.
    if (c === ".") {
      let beforeLen = 0;
      for (let j = i - 1; j >= 0 && /\d/.test(text.charAt(j)); j--) beforeLen++;
      let afterLen = 0;
      for (let j = i + 1; j < text.length && /\d/.test(text.charAt(j)); j++) afterLen++;
      if (beforeLen >= 1 && beforeLen <= 2 && afterLen >= 1 && afterLen <= 3) {
        continue;
      }
    }
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
