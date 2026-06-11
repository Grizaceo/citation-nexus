// Citation Nexus — Pattern Registry
// Compiles PatternSets into a single in-memory registry, then exposes
// applyPatterns() to scan a DOM subtree and produce Findings.

import type {
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

/**
 * Walks the text nodes under `root` and applies every registered pattern.
 * Overlapping matches are resolved by priority (descending), then by
 * earliest start.
 */
export function applyPatterns(
  root: Node,
  registry: PatternRegistry
): Finding[] {
  const findings: Finding[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip script, style, and our own highlight wrappers
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
        return NodeFilter.FILTER_REJECT;
      if (parent.classList.contains("nx-highlight")) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue || node.nodeValue.trim().length === 0)
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const patterns = registry.all();
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node as Text;
    const value = text.nodeValue ?? "";
    if (!value) continue;
    const localFindings: Finding[] = [];
    for (const p of patterns) {
      p.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = p.re.exec(value)) !== null) {
        if (m[0].length === 0) {
          p.re.lastIndex++;
          continue;
        }
        // If the pattern uses a capture group, surface the captured text
        // (more useful for import) but keep the full match position so the
        // highlighter can still wrap the right span.
        const captured = m.length > 1 && m[1] !== undefined ? m[1] : m[0];
        const offset = captured !== m[0] ? m[0].indexOf(captured) : 0;
        localFindings.push({
          patternId: p.id,
          category: p.category,
          label: p.label,
          text: captured,
          start: m.index + offset,
          end: m.index + offset + captured.length,
          node: text,
        });
      }
    }
    findings.push(...resolveOverlaps(localFindings));
  }
  return findings;
}

function resolveOverlaps(findings: Finding[]): Finding[] {
  if (findings.length <= 1) return findings;
  // Sort by start asc, then by (end - start) desc (longer match wins)
  findings.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });
  const out: Finding[] = [];
  let cursor = 0;
  for (const f of findings) {
    if (f.start >= cursor) {
      out.push(f);
      cursor = f.end;
    }
  }
  return out;
}
