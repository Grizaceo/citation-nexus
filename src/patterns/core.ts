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
   * Context disqualifiers. If any of these conditions match, the
   * finding is dropped even when the regex matches. Case-insensitive
   * word-boundary match.
   *
   *   - `excludeInSentence`: any of these words in the SAME sentence
   *     disqualifies. Useful for patterns whose tokens have a
   *     different meaning in scientific vs. everyday prose (e.g.
   *     "55.2 km" in an earthquake article is a depth, not a physics
   *     unit; the sentence mentions "depth" / "magnitude" / etc.).
   *
   * Implementation note: the disqualifier is checked on the text
   * *containing* the match — not on the matched substring itself.
   * For DOM scanning, that's the text node's value; for CLI batch
   * scanning, it's the input item text.
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
}
