import { describe, it, expect, beforeEach } from "vitest";
import {
  anyFalsifierMatches,
  applyPatterns,
  applyPatternsToText,
  PatternRegistry,
  runFalsifier,
} from "@/patterns/registry";
import type { Falsifier, MatchContext, PatternSet } from "@/patterns/core";

const arxivOnly: PatternSet = {
  id: "arxiv-only",
  name: "arXiv",
  description: "minimal arxiv.id pattern for falsifier tests",
  patterns: [
    {
      id: "arxiv.id",
      label: "arXiv ID",
      category: "citation",
      regex: "arXiv:\\s*(\\d{4}\\.\\d{4,5}(?:v\\d+)?)",
      flags: "gi",
    },
  ],
};

const doiOnly: PatternSet = {
  id: "doi-only",
  name: "DOI",
  description: "minimal doi pattern for falsifier tests",
  patterns: [
    {
      id: "doi",
      label: "DOI",
      category: "citation",
      regex: "\\b10\\.\\d{4,9}/[-._;()/:A-Z0-9]+\\b",
      flags: "gi",
    },
  ],
};

function reg(set: PatternSet): PatternRegistry {
  const r = new PatternRegistry();
  r.register(set);
  return r;
}

beforeEach(() => {
  document.body.replaceChildren();
});

const baseCtx = (overrides: Partial<MatchContext> = {}): MatchContext => ({
  text: "arXiv:2401.01234",
  start: 0,
  end: 17,
  confidence: 0.7,
  ...overrides,
});

describe("runFalsifier — context", () => {
  it("fires when the sentence contains a disqualifying word", () => {
    const f: Falsifier = { context: ["depth", "magnitude"] };
    const ctx = baseCtx({ text: "Depth: 55.2 km at the epicenter. arXiv:2401.01234" });
    expect(runFalsifier(f, ctx)).toBe(true);
  });

  it("does not fire when the sentence is clean", () => {
    const f: Falsifier = { context: ["depth", "magnitude"] };
    const ctx = baseCtx({ text: "We use the method. arXiv:2401.01234" });
    expect(runFalsifier(f, ctx)).toBe(false);
  });

  it("is case-insensitive on the disqualifying word", () => {
    const f: Falsifier = { context: ["Depth"] };
    const ctx = baseCtx({ text: "depth. arXiv:2401.01234" });
    expect(runFalsifier(f, ctx)).toBe(true);
  });

  it("respects word boundaries (won't match 'depths' for 'depth')", () => {
    const f: Falsifier = { context: ["depth"] };
    const ctx = baseCtx({ text: "Depths of the ocean. arXiv:2401.01234" });
    // 'depth' is a substring of 'depths' but the word boundary check
    // should reject. (Note: the check is "is `depth` a complete word
    // in the haystack?" — and 'depths' contains 'depth' as a prefix.)
    // In our implementation, `wordInText` requires word boundaries
    // on BOTH sides, so 'depth' inside 'depths' should NOT match.
    expect(runFalsifier(f, ctx)).toBe(false);
  });
});

describe("runFalsifier — before", () => {
  it("fires when text immediately before matches the string", () => {
    const f: Falsifier = { before: "version" };
    const ctx = baseCtx({
      text: "Software version arXiv:2401.01234",
      // 'arXiv:...' starts at position 16. Sliced text: 'Software version '.
      start: 16,
    });
    expect(runFalsifier(f, ctx)).toBe(true);
  });

  it("fires when text immediately before matches the regex", () => {
    const f: Falsifier = { before: /v\d+\.\d+\s*$/i };
    const ctx = baseCtx({
      text: "Released in v1.2 arXiv:2401.01234",
      // 'arXiv:...' starts at position 16. Sliced text: 'Released in v1.2 '.
      // \s*$ allows trailing whitespace before the match.
      start: 16,
    });
    expect(runFalsifier(f, ctx)).toBe(true);
  });

  it("does not fire when the text before is unrelated", () => {
    const f: Falsifier = { before: /v\d+\.\d+$/i };
    const ctx = baseCtx({
      text: "We propose arXiv:2401.01234",
      // 'arXiv:...' starts at position 11. Sliced text: 'We propose '.
      start: 11,
    });
    expect(runFalsifier(f, ctx)).toBe(false);
  });

  it("string check is case-insensitive (endsWith on lowercased)", () => {
    const f: Falsifier = { before: "Version" };
    const ctx = baseCtx({
      text: "Released in VERSION arXiv:2401.01234",
      // 'arXiv:...' starts at position 20. Sliced text: 'Released in VERSION '.
      start: 20,
    });
    expect(runFalsifier(f, ctx)).toBe(true);
  });
});

describe("runFalsifier — after", () => {
  it("fires when text immediately after matches the regex", () => {
    const f: Falsifier = { after: /^[;,]\s*10\./ };
    // '10.1038/x' is 9 chars. After-slice starts at 9 = ', 10.1126/y'.
    const ctx = baseCtx({
      text: "10.1038/x, 10.1126/y",
      start: 0,
      end: 9,
    });
    expect(runFalsifier(f, ctx)).toBe(true);
  });

  it("does not fire when the trailing context is a real citation", () => {
    const f: Falsifier = { after: /^[;,]\s*10\./ };
    const ctx = baseCtx({
      text: "10.1038/x. This is a real citation.",
      // '10.1038/x' is 9 chars, ends at position 9. After-slice: '. This...'.
      start: 0,
      end: 9,
    });
    expect(runFalsifier(f, ctx)).toBe(false);
  });
});

describe("runFalsifier — parent", () => {
  it("fires when parent tag matches (case-insensitive)", () => {
    const p = document.createElement("code");
    p.append(document.createTextNode("arXiv:2401.01234"));
    document.body.append(p);
    const f: Falsifier = { parent: { tag: "CODE" } };
    const ctx: MatchContext = {
      text: "arXiv:2401.01234",
      start: 0,
      end: 17,
      parent: p,
      confidence: 0.7,
    };
    expect(runFalsifier(f, ctx)).toBe(true);
  });

  it("fires when parent class matches", () => {
    const p = document.createElement("div");
    p.className = "codehilite language-text";
    p.append(document.createTextNode("arXiv:2401.01234"));
    document.body.append(p);
    const f: Falsifier = { parent: { class: "codehilite" } };
    const ctx: MatchContext = {
      text: "arXiv:2401.01234",
      start: 0,
      end: 17,
      parent: p,
      confidence: 0.7,
    };
    expect(runFalsifier(f, ctx)).toBe(true);
  });

  it("fires when BOTH tag and class match", () => {
    const p = document.createElement("code");
    p.className = "user-input";
    p.append(document.createTextNode("arXiv:2401.01234"));
    document.body.append(p);
    const f: Falsifier = { parent: { tag: "code", class: "user-input" } };
    const ctx: MatchContext = {
      text: "arXiv:2401.01234",
      start: 0,
      end: 17,
      parent: p,
      confidence: 0.7,
    };
    expect(runFalsifier(f, ctx)).toBe(true);
  });

  it("does not fire when tag is specified but doesn't match", () => {
    const p = document.createElement("span");
    p.append(document.createTextNode("arXiv:2401.01234"));
    document.body.append(p);
    const f: Falsifier = { parent: { tag: "CODE" } };
    const ctx: MatchContext = {
      text: "arXiv:2401.01234",
      start: 0,
      end: 17,
      parent: p,
      confidence: 0.7,
    };
    expect(runFalsifier(f, ctx)).toBe(false);
  });

  it("does not fire when class is specified but parent doesn't have it", () => {
    const p = document.createElement("div");
    p.append(document.createTextNode("arXiv:2401.01234"));
    document.body.append(p);
    const f: Falsifier = { parent: { class: "codehilite" } };
    const ctx: MatchContext = {
      text: "arXiv:2401.01234",
      start: 0,
      end: 17,
      parent: p,
      confidence: 0.7,
    };
    expect(runFalsifier(f, ctx)).toBe(false);
  });

  it("does not fire when parent is a DocumentFragment (text inside shadow root)", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.append(document.createTextNode("arXiv:2401.01234"));
    document.body.append(host);
    const f: Falsifier = { parent: { tag: "CODE" } };
    const ctx: MatchContext = {
      text: "arXiv:2401.01234",
      start: 0,
      end: 17,
      parent: shadow, // DocumentFragment, not an element
      confidence: 0.7,
    };
    expect(runFalsifier(f, ctx)).toBe(false);
  });
});

describe("runFalsifier — confidenceBelow", () => {
  it("fires when confidence is below the threshold", () => {
    const f: Falsifier = { confidenceBelow: 0.7 };
    const ctx = baseCtx({ confidence: 0.5 });
    expect(runFalsifier(f, ctx)).toBe(true);
  });

  it("does not fire when confidence equals the threshold", () => {
    const f: Falsifier = { confidenceBelow: 0.7 };
    const ctx = baseCtx({ confidence: 0.7 });
    expect(runFalsifier(f, ctx)).toBe(false);
  });

  it("does not fire when confidence is above the threshold", () => {
    const f: Falsifier = { confidenceBelow: 0.7 };
    const ctx = baseCtx({ confidence: 0.9 });
    expect(runFalsifier(f, ctx)).toBe(false);
  });
});

describe("anyFalsifierMatches", () => {
  it("returns true if any one falsifier fires", () => {
    const falsifiers: Falsifier[] = [
      { before: /forbidden/ },
      { confidenceBelow: 0.5 },
    ];
    const ctx = baseCtx({ confidence: 0.7 });
    // Neither fires, so anyFalsifierMatches returns false.
    expect(anyFalsifierMatches(falsifiers, ctx)).toBe(false);

    // The second one fires now.
    expect(anyFalsifierMatches(falsifiers, { ...ctx, confidence: 0.3 })).toBe(
      true
    );
  });

  it("returns false for an empty list (vacuous truth)", () => {
    expect(anyFalsifierMatches([], baseCtx())).toBe(false);
  });
});

describe("applyPatternsToText — falsifier integration", () => {
  it("drops a match when the context falsifier fires (text-only path)", () => {
    const set: PatternSet = {
      id: "depth",
      name: "depth",
      description: "depth test",
      patterns: [
        {
          id: "arxiv.id",
          label: "arXiv",
          category: "citation",
          regex: "arXiv:\\s*(\\d{4}\\.\\d{4,5})",
          flags: "gi",
          falsifiers: [{ context: ["depth", "magnitude"] }],
        },
      ],
    };
    const r = reg(set);
    expect(applyPatternsToText("arXiv:2401.01234", r)).toHaveLength(1);
    expect(
      applyPatternsToText(
        "Depth of the trench was 10 km. arXiv:2401.01234 in a real paper.",
        r
      )
    ).toHaveLength(0);
  });

  it("supports back-compat: excludeInSentence still works", () => {
    const set: PatternSet = {
      id: "backcompat",
      name: "backcompat",
      description: "excludeInSentence still works",
      patterns: [
        {
          id: "arxiv.id",
          label: "arXiv",
          category: "citation",
          regex: "arXiv:\\s*(\\d{4}\\.\\d{4,5})",
          flags: "gi",
          excludeInSentence: ["depth"],
        },
      ],
    };
    const r = reg(set);
    expect(applyPatternsToText("arXiv:2401.01234", r)).toHaveLength(1);
    expect(
      applyPatternsToText("Depth info arXiv:2401.01234", r)
    ).toHaveLength(0);
  });
});

describe("applyPatterns — DOM-context falsifier (parent)", () => {
  it("drops a match when the parent is <code> (DOM path)", () => {
    const set: PatternSet = {
      id: "code-parent",
      name: "code-parent",
      description: "drops arXiv inside <code>",
      patterns: [
        {
          id: "arxiv.id",
          label: "arXiv",
          category: "citation",
          regex: "arXiv:\\s*(\\d{4}\\.\\d{4,5})",
          flags: "gi",
          falsifiers: [{ parent: { tag: "CODE" } }],
        },
      ],
    };
    const r = reg(set);

    // In <code>: should be dropped
    const code = document.createElement("code");
    code.append(document.createTextNode("see arXiv:2401.01234"));
    document.body.append(code);

    // In <p>: should be kept
    const p = document.createElement("p");
    p.append(document.createTextNode("see arXiv:2506.09999"));
    document.body.append(p);

    const findings = applyPatterns(document.body, r);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.text).toBe("2506.09999");
  });

  it("keeps a match whose parent has no falsifier match", () => {
    const set: PatternSet = {
      id: "no-fp",
      name: "no-fp",
      description: "no falsifier",
      patterns: [
        {
          id: "arxiv.id",
          label: "arXiv",
          category: "citation",
          regex: "arXiv:\\s*(\\d{4}\\.\\d{4,5})",
          flags: "gi",
        },
      ],
    };
    const r = reg(set);
    const p = document.createElement("p");
    p.append(document.createTextNode("arXiv:2401.01234"));
    document.body.append(p);
    expect(applyPatterns(document.body, r)).toHaveLength(1);
  });
});

describe("Physics units — migrated excludeInSentence → falsifiers", () => {
  it("still drops earthquake-context matches (behavior preserved)", () => {
    // This is a regression guard for the legacy excludeInSentence
    // migration to the new falsifiers field. The Mindanao article
    // case from earlier sessions: "55.2 km" in a sentence with
    // "depth" should NOT be a match.
    const r = reg(arxivOnly);
    // Direct text-only check on the migrated physics.units pattern.
    // (arxivOnly doesn't include physics.units, so we build a custom
    // set inline for this specific regression check.)
    const set: PatternSet = {
      id: "physics-units",
      name: "physics-units",
      description: "the migrated physics.units pattern",
      patterns: [
        {
          id: "physics.units",
          label: "Physical unit",
          category: "physics",
          regex:
            "\\b\\d+(?:\\.\\d+)?\\s*(?:GeV|MeV|keV|TeV|fm|pm|nm|μm|kg|eV|ps|ns|us|ms)\\b",
          flags: "gi",
          falsifiers: [{ context: ["depth", "magnitude", "epicenter"] }],
        },
      ],
    };
    const r2 = reg(set);
    // "The depth was 55.2 km" — sentence has 'depth', should be dropped.
    expect(
      applyPatternsToText(
        "The depth was 55.2 km below the surface.",
        r2
      )
    ).toHaveLength(0);
    // "The energy is 7 TeV" — clean sentence, should be kept.
    expect(applyPatternsToText("The energy is 7 TeV.", r2)).toHaveLength(1);
  });
});

describe("DOI list falsifier (specific dogfooding case)", () => {
  it("drops the first DOI when followed by `, 10.` (list pattern)", () => {
    // Real case from the user request:
    // "rechazar si después viene ; o , seguido de otro DOI"
    // (reject if after comes ; or , followed by another DOI)
    const r = reg(doiOnly);
    const set: PatternSet = {
      id: "doi-list",
      name: "doi-list",
      description: "doi + list falsifier",
      patterns: [
        {
          id: "doi",
          label: "DOI",
          category: "citation",
          regex: "\\b10\\.\\d{4,9}/[-._;()/:A-Z0-9]+\\b",
          flags: "gi",
          falsifiers: [{ after: /^[;,]\s*10\./ }],
        },
      ],
    };
    const r2 = reg(set);
    // DOI list: "10.1038/x, 10.1126/y" — first one is in a list, drop.
    expect(applyPatternsToText("see 10.1038/x, 10.1126/y here", r2)).toHaveLength(1);
    expect(applyPatternsToText("see 10.1038/x, 10.1126/y here", r2)[0]!.text).toBe(
      "10.1126/y"
    );
  });
});

describe("arXiv ID inside <code> (dogfooding case)", () => {
  it("drops the match when the parent is <code>", () => {
    const r = reg(arxivOnly);
    const set: PatternSet = {
      id: "arxiv-code",
      name: "arxiv-code",
      description: "arXiv + code-parent falsifier",
      patterns: [
        {
          id: "arxiv.id",
          label: "arXiv",
          category: "citation",
          regex: "arXiv:\\s*(\\d{4}\\.\\d{4,5})",
          flags: "gi",
          falsifiers: [{ parent: { tag: "CODE" } }, { parent: { tag: "PRE" } }],
        },
      ],
    };
    const r2 = reg(set);
    const code = document.createElement("code");
    code.append(document.createTextNode("arXiv:2401.01234"));
    document.body.append(code);
    const pre = document.createElement("pre");
    pre.append(document.createTextNode("arXiv:2506.09999"));
    document.body.append(pre);
    const p = document.createElement("p");
    p.append(document.createTextNode("arXiv:2412.12345"));
    document.body.append(p);
    const findings = applyPatterns(document.body, r2);
    // Only the <p> one should survive; <code> and <pre> are dropped.
    expect(findings).toHaveLength(1);
    expect(findings[0]!.text).toBe("2412.12345");
  });
});
