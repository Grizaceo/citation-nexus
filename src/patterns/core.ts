// Citation Nexus — Pattern core types
// A PatternSet is a collection of PatternDefs that can be applied to a DOM
// subtree. Patterns are compiled once at registration time and reused.

export type Category =
  | "citation" // arXiv, DOI, PMID, GitHub
  | "math" // theorems, equations, definitions
  | "physics" // particles, detectors, units
  | "biology" // genes, proteins, techniques
  | "cs" // conferences, model families, complexity
  | "chemistry" // formulas
  | "default";

/**
 * A Falsifier is a declarative predicate that, when true, drops a
 * match even when the regex matches. Patterns can declare a list
 * of falsifiers; if ANY one fires, the match is discarded.
 *
 * Falsifiers are evaluated AFTER the regex matches but BEFORE the
 * match is added to the registry's findings. They're meant to be
 * cheap (one regex / string check, no async, no DOM walks beyond
 * the immediate parent).
 *
 * Inspired by Zotero's translator framework: many quick reject
 * rules, applied per match, with the most specific pattern winning.
 */
export type Falsifier =
  /** Drop the match if its SENTENCE contains any of these words
   *  (case-insensitive, word-boundary). Use for patterns whose
   *  tokens have a different meaning in scientific vs. everyday
   *  prose (e.g. "55.2 km" in an earthquake article is a depth,
   *  not a physics unit; the sentence mentions "depth" / "magnitude"
   *  / etc.). Replaces the older `excludeInSentence` field. */
  | { context: string[] }
  /** Drop the match if the text IMMEDIATELY BEFORE the match (in
   *  the same text node) matches the given string or regex.
   *  Useful for "version 1.2.3" preceding what looks like a DOI. */
  | { before: string | RegExp }
  /** Drop the match if the text IMMEDIATELY AFTER the match (in
   *  the same text node) matches. Useful for DOIs in a list
   *  (followed by `, 10.x` or `; 10.x` of another DOI). */
  | { after: string | RegExp }
  /** Drop the match if its parent element matches. Either `tag`
   *  (case-insensitive, e.g. "CODE" matches <code>) or `class`
   *  (the parent must have that class in its classList).
   *  For text directly under a DocumentFragment (e.g. inside a
   *  shadow root), this falsifier never fires because there is
   *  no element parent to check. */
  | { parent: { tag?: string; class?: string } }
  /** Drop the match if its assigned confidence is below the
   *  given threshold (0-1). Used together with the meta-tag /
   *  JSON-LD confidence ladder — e.g. `{ confidenceBelow: 0.7 }`
   *  drops anything that wasn't backed by a high-confidence
   *  source. Added in the confidence-ladder phase. */
  | { confidenceBelow: number };

export interface PatternDef {
  /** Unique id within the set, e.g. "arxiv.abs" */
  id: string;
  /** Display label for popup / tooltip, e.g. "arXiv abstract" */
  label: string;
  /** Category drives the CSS class (`.hl-${category}`) */
  category: Category;
  /** Raw regex source. Compiled at registration. */
  regex: string;
  /** Regex flags. Default "g" (global, lastIndex reset before use). */
  flags?: string;
  /** Optional priority — higher wins when ranges overlap. Default 0. */
  priority?: number;
  /** Optional tooltip text or metadata accessor */
  tooltip?: string;
  /**
   * Quick-reject rules. If any falsifier fires, the match is
   * dropped even though the regex matched. See `Falsifier` for
   * the four supported kinds. Patterns can mix and match.
   *
   *   - `{ context: [...] }` — sentence-level word check
   *     (replaces the older `excludeInSentence` field)
   *   - `{ before: ... }` / `{ after: ... }` — adjacent text
   *   - `{ parent: { tag, class } }` — DOM element check
   *   - `{ confidenceBelow: n }` — confidence threshold
   */
  falsifiers?: Falsifier[];
  /**
   * @deprecated Use `falsifiers: [{ context: [...] }]` instead.
   * Still honored as a synonym for `[{ context: ... }]` for
   * backward compatibility with existing pattern definitions.
   */
  excludeInSentence?: string[];
}

export interface CompiledPattern extends Omit<PatternDef, "regex" | "flags"> {
  re: RegExp;
}

export interface PatternSet {
  /** Stable set id, e.g. "citations", "science" */
  id: string;
  /** Human-readable name, e.g. "Citations", "Science (English)" */
  name: string;
  description: string;
  patterns: PatternDef[];
}

export interface Finding {
  patternId: string;
  category: Category;
  label: string;
  text: string;
  start: number; // offset within the text node
  end: number; // exclusive
  node: Text; // source DOM text node
  /** Confidence 0-1. Currently only meaningful for matches that
   *  come from meta tags or JSON-LD; text-body matches default
   *  to a fixed value. Used by `{ confidenceBelow: n }` falsifiers. */
  confidence?: number;
}

/** Like Finding but without the DOM node reference. Used by the
 *  pure (text-only) scan path that the CLI / goldset use. */
export interface PureFinding {
  patternId: string;
  category: Category;
  label: string;
  text: string;
  start: number; // offset within the text node
  end: number; // exclusive
  /** Full match length before any capture-group extraction. Used to
   *  break ties in overlap resolution (longer = more specific). */
  originalLength: number;
  /** Pattern priority. Higher wins on full ties (same start, same
   *  originalLength). Default 0. */
  priority: number;
  /** Confidence 0-1. See Finding.confidence. */
  confidence?: number;
}

/** Context passed to falsifier checks. Bundles everything a
 *  falsifier might need so individual checks stay one-liners. */
export interface MatchContext {
  /** Full text the regex matched against (the text node value
   *  for DOM scans, the input string for pure scans). */
  text: string;
  /** Start offset of the match within `text`. */
  start: number;
  /** End offset of the match within `text` (exclusive). */
  end: number;
  /** Parent node of the matched text. For text-body matches this
   *  is the enclosing element (or DocumentFragment inside shadow
   *  roots). Undefined for pure (text-only) scans. */
  parent?: Node;
  /** Confidence 0-1. Default 0.7 for text-body matches; higher
   *  for meta-tag / JSON-LD matches (set by the scanner). */
  confidence: number;
}
