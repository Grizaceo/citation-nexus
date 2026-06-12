import { describe, it, expect } from "vitest";
import {
  applyPatternsToText,
  PatternRegistry,
} from "../registry";
import type { PatternSet } from "../core";

const emptySet: PatternSet = {
  id: "empty",
  name: "Empty",
  description: "no patterns",
  patterns: [],
};

const twoArxivSet: PatternSet = {
  id: "two-arxiv",
  name: "Two arXiv variants",
  description: "tests overlap resolution",
  patterns: [
    {
      id: "strict",
      label: "Strict arXiv",
      category: "citation",
      regex: "arXiv:(\\d{4}\\.\\d{4,5})",
      flags: "gi",
    },
    {
      id: "loose",
      label: "Loose arXiv",
      category: "citation",
      // Same span as "strict" but a longer prefix alternative so
      // originalLength tiebreaker kicks in.
      regex: "(arXiv:\\s*\\d{4}\\.\\d{4,5})",
      flags: "gi",
    },
  ],
};

const prioritySet: PatternSet = {
  id: "priority-test",
  name: "Priority test",
  description: "tests priority tiebreaker",
  patterns: [
    {
      id: "low",
      label: "Low priority",
      category: "biology",
      regex: "CO2",
      priority: 0,
    },
    {
      id: "high",
      label: "High priority",
      category: "chemistry",
      regex: "CO2",
      priority: 2,
    },
  ],
};

function reg(set: PatternSet): PatternRegistry {
  const r = new PatternRegistry();
  r.register(set);
  return r;
}

describe("applyPatternsToText — edge cases", () => {
  it("empty text yields no findings", () => {
    expect(applyPatternsToText("", reg(emptySet))).toHaveLength(0);
  });

  it("PatternSet with zero patterns yields no findings", () => {
    expect(applyPatternsToText("anything goes here", reg(emptySet))).toHaveLength(0);
  });

  it("non-matching text yields no findings", () => {
    const r = reg(twoArxivSet);
    expect(applyPatternsToText("hello world without id", r)).toHaveLength(0);
  });

  it("every match is preserved when no overlap", () => {
    const r = reg(twoArxivSet);
    const out = applyPatternsToText(
      "see arXiv:2401.01234 and arXiv:2506.09999",
      r
    );
    // Two arxiv ids; each pattern matches each once → 4 findings,
    // deduped to 2 because the two patterns cover the same range so
    // overlap resolution drops one per id. The "loose" pattern (with
    // its wider capture group) starts earlier, so it wins on the
    // start-tiebreaker and is the survivor.
    const ids = out.map((f) => f.text);
    expect(ids).toContain("arXiv:2401.01234");
    expect(ids).toContain("arXiv:2506.09999");
    expect(out.length).toBe(2);
  });
});

describe("applyPatternsToText — overlap resolution", () => {
  it("longer original match wins on same-start ties", () => {
    const r = reg(twoArxivSet);
    const out = applyPatternsToText("arXiv:2401.01234", r);
    // "loose" is longer (m[0] = "arXiv:2401.01234" 15 chars) than
    // "strict" with capture group (text is the captured digits). The
    // originalLength tiebreaker should prefer "loose".
    expect(out).toHaveLength(1);
    expect(out[0]!.patternId).toBe("loose");
    expect(out[0]!.text).toBe("arXiv:2401.01234");
  });

  it("higher-priority pattern wins on equal-length ties", () => {
    const r = reg(prioritySet);
    const out = applyPatternsToText("emit CO2 daily", r);
    expect(out).toHaveLength(1);
    expect(out[0]!.patternId).toBe("high");
    expect(out[0]!.category).toBe("chemistry");
  });
});

describe("applyPatternsToText — flags + global", () => {
  it("respects the 'g' flag: matches every occurrence, not just first", () => {
    const r = reg(twoArxivSet);
    const out = applyPatternsToText(
      "arXiv:2401.01234 arXiv:2401.01234 arXiv:2401.01234",
      r
    );
    // 3 ids × 2 patterns = 6, deduped to 3 by overlap.
    expect(out).toHaveLength(3);
  });

  it("respects case-insensitive 'i' flag", () => {
    const set: PatternSet = {
      id: "ci",
      name: "CI",
      description: "case-insensitive",
      patterns: [
        {
          id: "arxiv.ci",
          label: "arXiv",
          category: "citation",
          regex: "arxiv:(\\d{4}\\.\\d{4,5})",
          flags: "gi",
        },
      ],
    };
    const r = reg(set);
    const out = applyPatternsToText(
      "ARXIV:2401.01234 and arxiv:2506.09999",
      r
    );
    expect(out).toHaveLength(2);
  });
});
