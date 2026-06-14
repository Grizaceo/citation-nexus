# Chrome Web Store screenshot spec

The Chrome Web Store listing accepts 1 to 5 screenshots.
Each must be 1280×800 (or 640×400). PNG or JPEG. The
first one is the hero — it shows in the listing card
thumbnail and on the install dialog.

The screenshots are the highest-ROI asset in the listing.
Users decide whether to install in 3 seconds; the
screenshots do all the talking.

## What the popup actually looks like

The popup is a vertical card (Chrome extension popup
shape: ~400 px wide, variable height, max viewport height).
Dark theme, dense, with per-category color accents. The
hero screenshot should show the popup in context — the
popup overlaid or beside an academic page.

## Five screenshots, ordered by what to lead with

### Screenshot 1 — The hero: in-page highlight

- Setup: a real arXiv abstract page
  (e.g. https://arxiv.org/abs/2401.01234) with the
  extension enabled and the popup closed
- Show: the page with citation IDs and theorem names
  highlighted in the text, with the colored keyword
  spans visible
- Crop: full page, 1280×800
- The hero tells the user "this is what the extension
  does to the page". The popup is not in the shot — the
  page is the star.

### Screenshot 2 — The popup with findings

- Setup: same arXiv page, popup open
- Show: the popup in its full glory — header, pause
  toggle, total findings, category chips, the per-finding
  list with [Copy] / [Open] / [Save] buttons visible
- Crop: 1280×800, with the popup on the right side and
  the page visible on the left
- The second screenshot answers "what does clicking the
  icon show me?". Buyers who paused on screenshot 1 will
  click into screenshot 2.

### Screenshot 3 — The agentic bridge (CLI / dev tool)

- Setup: a terminal window with `curl
  http://127.0.0.1:3002/patterns` and a sample response
- Show: the curl output, the JSON response with the
  pattern catalog
- Crop: 1280×800, full terminal window
- The third screenshot sells to the "I can script this"
  audience. This is the differentiator vs every other
  citation extension.

### Screenshot 4 — Save to vault (the [Save] action)

- Setup: the popup with a high-confidence finding and
  the [Save] button visible; OR a terminal showing
  the vault directory with a new PDF
- Show: the moment of saving, the result
- Crop: 1280×800
- The fourth screenshot shows the value loop:
  highlight → find → save to local library.

### Screenshot 5 — The embeddings opt-in

- Setup: the popup with the embeddings section expanded
  after the user enables the toggle
- Show: the model dropdown, the search input, the
  [Find similar] dev tool button
- Crop: 1280×800
- The fifth screenshot is for the power-user audience.
  Skip if the store listing is already at 5 slots and
  Screenshot 1-3 carry the message.

## How to capture (Windows / WSL)

1. Install the extension: `chrome://extensions` →
   enable Developer mode → "Load unpacked" → select
   `citation-nexus/.output/chrome-mv3/`
2. Open the page (e.g. arXiv abstract) and let the
   scanner run (1-2 seconds, watch for the keyword
   highlight spans to appear)
3. For Screenshot 1: full-page capture with the
   browser's built-in screenshot tool
   (`Ctrl+Shift+S` → "Capture full size page") or
   the DevTools "Capture full size screenshot" in the
   Command Palette
4. For Screenshot 2: open the popup (click the
   extension icon), then full-screen capture. Or use
   the "Capture visible tab" approach with the popup
   visible.
5. Crop to 1280×800 in any image editor. The Chrome
   Web Store accepts 1280×800 only; the original capture
   can be larger.

## Production

- No real names, no real email addresses, no real
  personal data visible in the screenshots
- No "Lorem ipsum" or "Coming soon" — the popup must
  be real, on a real page, with real findings
- Crop tight: tight screenshots read as polished
- Consider a 2-3 px solid border in the popup's accent
  blue so the popup reads as a card on the screenshot

## Composition tips

- The hero (Screenshot 1) should be readable at 200 px
  wide — the Chrome Web Store thumbnails that small in
  the search results
- Avoid putting all 5 screenshots in a single batch
  upload to Chrome; the dashboard sometimes reorders
  them and you lose the narrative
- Don't include the README's badge row in any screenshot
  — it's marketing, not the product

## Decision needed before this commit

None. The spec is the work. After the user captures
5 screenshots following this guide, they get committed
to `marketing/webstore/screenshots/` (or a similar
location) and the listing copy is updated to reference
the image filenames.
