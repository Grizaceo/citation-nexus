import { describe, it, expect, beforeEach } from "vitest";
import { applyPatterns, PatternRegistry } from "@/patterns/registry";
import { citationsSet } from "@/patterns/sets/citations";
import type { PatternSet } from "@/patterns/core";

const arxivOnly: PatternSet = {
  id: "arxiv-only",
  name: "arXiv only",
  description: "minimal set for shadow-DOM tests",
  patterns: [
    {
      id: "arxiv.id",
      label: "arXiv",
      category: "citation",
      regex: "arXiv:\\s*(\\d{4}\\.\\d{4,5}(?:v\\d+)?)",
      flags: "gi",
    },
  ],
};

function reg(): PatternRegistry {
  const r = new PatternRegistry();
  r.register(arxivOnly);
  return r;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("applyPatterns — shadow DOM walking", () => {
  it("finds text inside an open shadow root (Reddit's <shreddit-post> shape)", () => {
    const host = document.createElement("div");
    // happy-dom supports attachShadow; mode 'open' is required so we
    // can read .shadowRoot back.
    const shadow = host.attachShadow({ mode: "open" });
    const inner = document.createElement("span");
    inner.textContent = "Paper: arXiv:2605.22166";
    shadow.append(inner);
    document.body.append(host);

    const findings = applyPatterns(document.body, reg());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.text).toBe("2605.22166");
  });

  it("still finds text in the light DOM (regression check)", () => {
    const p = document.createElement("p");
    p.textContent = "Reference: arXiv:2401.01234";
    document.body.append(p);

    const findings = applyPatterns(document.body, reg());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.text).toBe("2401.01234");
  });

  it("recurses into nested shadow roots (shadow within shadow)", () => {
    const outer = document.createElement("div");
    const outerShadow = outer.attachShadow({ mode: "open" });
    const inner = document.createElement("span");
    inner.textContent = "outer: nothing here";
    outerShadow.append(inner);

    const nested = document.createElement("div");
    const innerShadow = nested.attachShadow({ mode: "open" });
    const innerSpan = document.createElement("p");
    innerSpan.textContent = "inner: arXiv:2506.09999";
    innerShadow.append(innerSpan);

    outerShadow.append(nested);
    document.body.append(outer);

    const findings = applyPatterns(document.body, reg());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.text).toBe("2506.09999");
  });

  it("finds text in light DOM AND shadow DOM of the same page", () => {
    // Two separate hosts, one with light text, one with shadow text.
    // Avoids a happy-dom quirk where attachShadow on a host with
    // existing light-DOM children re-parents them.
    const lightHost = document.createElement("p");
    lightHost.textContent = "light: arXiv:2401.01234";
    document.body.append(lightHost);

    const shadowHost = document.createElement("div");
    const shadow = shadowHost.attachShadow({ mode: "open" });
    shadow.append(
      document.createTextNode("shadow: arXiv:2506.09999")
    );
    document.body.append(shadowHost);

    const findings = applyPatterns(document.body, reg());
    const ids = findings.map((f) => f.text).sort();
    expect(ids).toEqual(["2401.01234", "2506.09999"]);
  });

  it("skips <script> inside a shadow root", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const script = document.createElement("script");
    script.textContent = "arXiv:2401.01234";
    shadow.append(script);
    const span = document.createElement("span");
    span.textContent = "real match: arXiv:2506.09999";
    shadow.append(span);
    document.body.append(host);

    const findings = applyPatterns(document.body, reg());
    expect(findings).toHaveLength(1);
    expect(findings[0]!.text).toBe("2506.09999");
  });

  it("regression: full citationsSet still works on a flat DOM", () => {
    // Sanity check that the refactor didn't break the full set.
    const r = new PatternRegistry();
    r.register(citationsSet);
    const p = document.createElement("p");
    p.textContent = "arXiv:2401.01234 and DOI 10.1038/nature12373";
    document.body.append(p);
    const findings = applyPatterns(document.body, r);
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });
});
