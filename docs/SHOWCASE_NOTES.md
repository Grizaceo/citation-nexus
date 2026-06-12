# Discord note for 🧩丨show-your-case

**Project:** Citation Nexus — https://github.com/Grizaceo/citation-nexus
**Tags:** #MiniMaxM3 #citation-spotter #chrome-extension #agentic

---

**Short note (paste this in the channel):**

Built Citation Nexus end-to-end with MiniMax-M3 in a single greenfield
session: Chrome MV3 extension that detects academic citations (arXiv, DOI,
PubMed, GitHub, bioRxiv) and English-language science concepts (math,
physics, biology, CS, chemistry) on any web page, highlights them with
per-category colors + tooltips, wraps the whole sentence when a match
fires (so you can diagonal-read by scanning sentence blocks), and exposes
an agentic JSON API over a local HTTP bridge + a Chrome native messaging
host so any CLI agent (Hermes, Claude, plain curl) can scan and import
without opening the browser.

What M3 actually pulled off in this run:
- Designed the entire architecture unprompted (WXT + Vite + MV3 + a
  separate Python FastAPI bridge + a Python native messaging host +
  goldset evaluation harness with CI gate).
- Wrote 24 production regex patterns (citations + science), then built
  a hand-curated goldset of ~430 positive/negative examples across all
  24 patterns, then iteratively fixed each pattern until macro F1 = 0.989
  (gate is 0.85).
- Wrote 88 tests across TS (vitest) + Python (pytest) covering the
  pattern engine, overlap resolution, sentence detection, sentence-level
  highlighting, background message routing, the content-script scan
  cycle, the bridge protocol, the native host JSON framing, and the
  batch CLI scanner.
- Debugged its own bugs as I reported them: a sender.tab.id miss
  (popup was showing 0 findings), CSS not being injected (highlights
  invisible), the sentence detector splitting "Theorem 1.2 we conclude"
  into two halves at the decimal, and a re-scan feedback loop that was
  duplicating highlights to "StatStatStatStatStat...".
- Set up 4-job CI (typescript, bridge, goldset, native-host) with a
  F1-gate, MIT LICENSE, polished README with badges, and a clean
  15-commit history.

Total: 54 files, 4k lines, build is 49 kB, F1 = 0.989, 88 tests green.
First end-to-end model I've used that was able to drive a full
ship-it loop on a project this size without me doing the boring bits
myself.
