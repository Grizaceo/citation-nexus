# Chrome Web Store icon spec

The Chrome Web Store and the Chrome runtime require icons at
four sizes. The manifest must declare them in an `icons`
array; the popup action must declare a `default_icon`. The
existing manifest has neither — both get added when the icon
files exist.

## Required sizes

| Size | Used in                                              |
|------|------------------------------------------------------|
| 16   | Browser tab favicon (extension icon)                  |
| 32   | Windows taskbar / extension management page           |
| 48   | Chrome extensions page (chrome://extensions)         |
| 128  | Chrome Web Store listing + install dialog            |

All four should look like the same logo at different sizes.
The 16 px must be legible — that's the test.

## Format

- PNG, 24-bit color + alpha (transparent background)
- No rounded background baked in — Chrome applies its own
  mask to the 16/32/48 sizes
- sRGB color space
- No animation (Chrome Web Store rejects APNG / animated
  GIFs)

## Design concept

The current popup uses a dark theme with a small palette of
accent colors. The icon should match the popup's
information-density feel: simple, technical, not playful.

Two options, both tried in past icon work. Pick one.

### Option A — Citation mark (recommended)

A stylized left double-quote / right double-quote pair
(like a citation, ≷ or ""), centered, in a single accent
color from the popup's palette. The marks read as a citation
glyph at a glance and scale down to 16 px without losing
recognition.

- Glyph: two left-angle brackets facing each other
  (「 」) or two thick slashes (「/」)
- Color: one of the popup accents — `#3aa1ff` (blue) is the
  safest (works on light + dark Chrome themes)
- Background: transparent
- Padding: ~12% inset on all sides (Chrome may apply
  its own mask)

The advantage: the mark is unique to this extension
(no other extension uses this glyph combo), reads at 16 px,
and doesn't require text.

### Option B — CN monogram

Bold uppercase "CN" in a sans-serif typeface (Inter or
similar), centered, in the same accent color. Scales well
to 48 and 128; at 16 px the letters are barely readable
but the silhouette is recognizable.

- Typeface: Inter Black or SF Pro Display Bold
- Color: same accent as Option A
- Background: transparent
- Padding: ~10% inset

The advantage: simpler to design and source. The
disadvantage: less distinctive; could be confused with
any extension whose name starts with C or N.

## Color palette (matches the popup)

| Color   | Hex       | Use                              |
|---------|-----------|----------------------------------|
| Blue    | `#3aa1ff` | Primary accent / icon (default)  |
| Orange  | `#ff9d3a` | Category accent / fallback icon  |
| Green   | `#5fcf6a` | Category accent                  |
| Red     | `#e26464` | Category accent                  |
| BG dark | `#0e1218` | Popup background (NOT for icon)   |
| BG light | `#e8eaed` | Light-theme icon (optional)      |

## Process

1. Decide Option A or B (or propose a third).
2. Generate one design at 512 px, then downscale to 128,
   48, 32, 16 to verify legibility at each size.
3. Save as `public/icon-{16,32,48,128}.png`. The `public/`
   directory is the WXT convention for static assets that
   get copied to `.output/chrome-mv3/` at build time.
4. Add to `wxt.config.ts` manifest:

   ```ts
   icons: {
     "16": "icon-16.png",
     "32": "icon-32.png",
     "48": "icon-48.png",
     "128": "icon-128.png",
   },
   action: {
     default_title: "Citation Nexus",
     default_icon: {
       "16": "icon-16.png",
       "32": "icon-32.png",
     },
   },
   ```

5. Verify in `chrome://extensions` (refresh, then look at
   the card and the toolbar icon).

## Don't

- Don't add text. The 16 px can't carry a wordmark.
- Don't use a gradient (the mark needs to read at 16 px
  in both light and dark Chrome themes).
- Don't use a single dark color — it disappears on the
  dark Chrome theme.
- Don't include a paper / book / link glyph unless
  the design has been approved — academic visual
  language is crowded.

## Decision needed before this commit

Which option (A / B / other) and which accent color.
The user has the final call. Once decided, the four
PNGs are generated and this spec moves to "done".
