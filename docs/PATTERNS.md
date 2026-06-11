# Citation Nexus — Patterns

## How patterns work

A `PatternDef` is a regex with metadata. At registration time the registry
compiles it once. At scan time the content script walks text nodes and
applies every pattern, dropping overlapping matches (highest priority, then
longest match wins).

```ts
{
  id: "arxiv.id",
  label: "arXiv ID",
  category: "citation",
  regex: "(?:arXiv:|(?<![\\w/]))(\\d{4}\\.\\d{4,5}(?:v\\d+)?)\\b",
  flags: "gi",
  tooltip: "arXiv preprint",
}
```

## Categories → CSS

| Category    | CSS class                  | Color theme            |
|-------------|----------------------------|------------------------|
| citation    | `.nx-highlight-citation`   | blue                   |
| math        | `.nx-highlight-math`       | orange                 |
| physics     | `.nx-highlight-physics`    | dodger blue            |
| biology     | `.nx-highlight-biology`    | green                  |
| cs          | `.nx-highlight-cs`         | purple (dashed)        |
| chemistry   | `.nx-highlight-chemistry`  | gold                   |

## Adding a new pattern

1. Add a `PatternDef` to the appropriate `sets/*.ts` file.
2. Add positive + negative examples in the test file
   (`src/patterns/tests/*.test.ts`).
3. If the pattern needs a new category, add a CSS rule in
   `src/assets/content.css`.
4. Mirror the id in `bridge/nexus_bridge/server.py` → `PATTERN_SETS` so the
   `/patterns` endpoint exposes it.
5. The bridge test `test_pattern_sets_match_ts` will fail loudly if you
   forget step 4.

## Adding a new pattern set (e.g. "humanities", "linguistics")

1. Create `src/patterns/sets/humanities.ts` exporting a `PatternSet`.
2. Register it in `src/patterns/registry.ts` →
   `getDefaultRegistry()`.
3. Add a chip in the options page (`src/entrypoints/options/main.ts`).
4. Add to `PATTERN_SETS` in `bridge/nexus_bridge/server.py`.

## Goldset

For higher precision we recommend a `goldset/` folder of JSONL files
per pattern (positive and negative examples), like `nexum/goldset/`. A
future `scripts/eval_goldset.py` will compute precision/recall per
pattern against the goldset; it can be wired in CI.
