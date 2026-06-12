# X / Twitter

## Post (single tweet, 273 chars)

```
I built a Chrome extension that highlights arXiv IDs, DOIs, theorems,
ML model names, gene symbols, etc. on any web page — wrapped in
sentence-level blocks for diagonal reading. Plus an agentic JSON API
so any CLI agent can drive it. 88 tests, F1=0.989, MIT.

#MiniMaxM3
github.com/Grizaceo/citation-nexus
```

## Thread (3 tweets, if you want more reach)

**1/3:**
Chrome extensions have always been a black box for CLI agents — the
data they surface is trapped in the browser. I built Citation Nexus to
fix that: a Chrome MV3 extension that detects citations and science
concepts on any page, AND a local HTTP bridge + native messaging host
so any CLI agent (Hermes, Claude, plain curl) can drive it.

#MiniMaxM3

**2/3:**
The interesting part: ~430-example goldset across 24 patterns, gated
on macro F1 ≥ 0.85. Currently at 0.989. 88 tests across TS + Python.
Sentence-level highlighting (the whole sentence gets a subtle
background when it contains a match) so you can diagonal-read by
scanning blocks, not by hunting keywords.

github.com/Grizaceo/citation-nexus

**3/3:**
Built end-to-end with MiniMax-M3 in one session. M3 designed the
architecture, wrote all 24 patterns, built the eval harness, debugged
its own bugs (decimal-guard in sentence detection, sender.tab.id
miss, CSS-not-injected, re-scan feedback loop), and shipped a polished
README with badges.

#MiniMaxM3
```

---

# Reddit

## r/sideproject (best fit)

**Title:**
I built a Chrome extension that highlights academic citations and
science concepts on any web page, with an agentic JSON API so CLI
agents can drive it. Open source, MIT.

**Body:**
```

Hi r/sideproject. I built this with MiniMax-M3 over a single
session and I'm pretty happy with how it came out.

**What it does:**

On any web page, the extension detects:
- Citations: arXiv IDs, DOIs, PubMed IDs, GitHub repos
- English science concepts: theorems, definitions, particles,
  chemical formulas, gene symbols, ML model names, dataset names
  (math, physics, biology, CS, chemistry)

…highlights them with per-category colors + tooltips, and wraps the
whole sentence in a subtle background block when it contains a
match. The point is diagonal reading: instead of hunting for
keywords, you scan for sentence blocks and read those.

It also has an agentic JSON API: a local HTTP bridge and a Chrome
native messaging host, so any CLI agent (Hermes, Claude, plain
curl) can scan a URL, list findings, and import them to a local
vault — without opening the browser.

**The engineering:**

- 24 patterns across two sets (citations, science)
- ~430-example goldset, CI-gated at macro F1 ≥ 0.85 (currently
  0.989)
- 88 tests across vitest + pytest
- 4-job CI: typescript, bridge, goldset, native-host
- MIT, 49 kB build, 4k lines, 15-commit history

**The interesting bug stories:**

- `sender.tab.id` was undefined → popup showed 0 findings
- CSS wasn't being injected into content scripts → highlights were
  invisible
- Sentence detector split "Theorem 1.2 we conclude" at the decimal
- Re-scan MutationObserver created a feedback loop that
  duplicated highlights to "StatStatStatStatStat..."

M3 caught all of these. The decimal-guard fix alone took a few
iterations to get the regex right (abbreviation blacklist + the
`1.2` vs `arXiv:2401.01234` distinction).

**Repo:**
https://github.com/Grizaceo/citation-nexus

Built with #MiniMaxM3.

```

## r/ClaudeAI (agentic angle)

**Title:**
Built a Chrome extension that any CLI agent can drive, end-to-end
with MiniMax-M3. Includes a native messaging host for the
extension itself to be scriptable.

**Body:**
[Same body, but lead with the agentic angle — the bridge + native
host — and trim the regex-bug story. ~200 words.]

## r/chrome_extensions

**Title:**
Citation Nexus — MV3 extension that highlights academic citations
and science concepts, with sentence-level wrapping for diagonal
reading. Open source, MIT.

**Body:**
[Trim to the Chrome-specific bits: manifest, content script, CSS
injection, popup. Skip the agentic angle. ~200 words.]

---

# LinkedIn

```
Open-sourced Citation Nexus today — a Chrome MV3 extension + agent
bridge I built with MiniMax-M3 in one session.

It detects arXiv/DOI/PubMed citations and English-language science
concepts (math, physics, biology, CS, chemistry) on any web page,
highlights them with per-category colors, and wraps the whole
sentence when a match fires (so you can diagonal-read by scanning
blocks).

The agentic bit: a local HTTP bridge and Chrome native messaging
host so any CLI agent can drive it — scan URLs, list findings,
import to vault — without opening the browser.

88 tests, F1 = 0.989, MIT, 49 kB build. The whole thing was a
single-session build with M3 designing the architecture, writing
24 regex patterns, building a 430-example goldset for evaluation,
debugging its own bugs, and shipping a polished README.

github.com/Grizaceo/citation-nexus

#MiniMaxM3
```

---

# Visual assets to capture (do these BEFORE posting)

You need at least one. Three is ideal.

1. **demo/demo.html rendered in Chrome** (5 sec)
   - `cd citation-nexus && python3 -m http.server 8080`
   - Open http://localhost:8080/demo/demo.html in Chrome with
     the extension loaded
   - Take a screenshot of the highlights

2. **Wikipedia article** with the extension on (10 sec)
   - Open any Wikipedia science article
   - The sentence-level highlight is most visible here

3. **The popup** (10 sec)
   - Open the extension popup on a page with findings
   - Shows the category breakdown

Optional 4: **a 30-second screen capture** showing:
- Page loads with no highlights
- Page renders with all the highlights
- Click a highlight, tooltip appears
- Open popup, see the categories

If you want to make a TikTok / YouTube Short / Reel, the screen
capture is mandatory. 30 sec is enough.

---

# Posting checklist

[ ] GitHub repo is public and looks good in the browser
    https://github.com/Grizaceo/citation-nexus
[ ] LICENSE present and visible (MIT)
[ ] README has badges + clear "What it does" + Quick Start
[ ] At least one screenshot (the demo.html one is easiest)
[ ] Account for the platform you're posting to is logged in

Post order (highest signal first, then volume):
[ ] Reddit r/sideproject (long-form, story-driven, dev audience)
[ ] X / Twitter (single tweet OR thread — single tweet first,
    reply with thread if engagement)
[ ] Reddit r/ClaudeAI (cross-post the body, trim the agentic bits)
[ ] LinkedIn (if you have a professional account)
[ ] Discord 🧩丨show-your-case (paste the short note + the link)

After posting, drop the link + a one-line note in
**🧩丨show-your-case** per the rules.

Good luck — the project speaks for itself; the story is the
single-session build with M3 designing and shipping it
end-to-end. That's the angle.
