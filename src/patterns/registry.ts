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
      local.push({
        patternId: p.id,
        category: p.category,
        label: p.label,
        text: captured,
        start: m.index + offset,
        end: m.index + offset + captured.length,
        originalLength: m[0].length,
      });
    }
  }
  return resolveOverlaps(local);
}

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
      if (!parent) return 2 /* FILTER_REJECT */;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
        return 2;
      if (parent.classList.contains("nx-highlight")) return 2;
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
