#!/usr/bin/env python3
"""Render the Chrome Web Store small promo tile (440x280).

Layout: dark background (matches the popup), large "><" icon
mark on the left, product name + tagline on the right.

The promo tile appears in the Chrome Web Store search results
and the install dialog. The Chrome Web Store guidelines say:
  - No pricing, install counts, or ratings
  - Don't use generic "SaaS template" look
  - Be readable at thumbnail size (Chrome shows it ~200px wide)
"""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 440, 280
BG = (14, 18, 24, 255)              # popup dark background #0e1218
ACCENT = (58, 161, 255, 255)        # #3aa1ff
TEXT = (255, 255, 255, 255)
SUBTEXT = (200, 210, 220, 255)
DIVIDER = (60, 70, 80, 255)
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "..", "public", "promo-tile-small.png")

# Find a system font. DejaVu Sans is widely available on Linux.
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def draw_bracket(d: ImageDraw.ImageDraw, cx: int, cy: int, half_w: int,
                 half_h: int, stroke: int, color: tuple) -> None:
    """Draw a single chevron ">" or "<" with thick rounded stroke.

    The chevron is rendered as a polyline: back-top → tip → back-bottom.
    The tip points horizontally toward (cx).
    """
    # For the left chevron (">"), the back is to the LEFT of cx, tip to the right
    # For the right chevron ("<"), the back is to the RIGHT of cx, tip to the left
    # We just draw two polylines that mirror each other.
    pass  # implemented inline below for clarity


def render() -> None:
    img = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(img)

    # ── Left section: the icon mark ════════════════════════════
    # Draw two thick chevrons centered around (90, 140)
    # Each chevron: 36 px wide (back to tip), 80 px tall (back arm)
    icon_cx = 95
    icon_cy = H // 2
    bracket_w = 38  # distance from back to tip
    bracket_h = 60  # half-height of the back arm
    stroke_w = 14  # thickness of the chevron

    # Left chevron ">"
    left_back_x = icon_cx - 50
    left_tip_x = left_back_x + bracket_w
    d.line(
        [
            (left_back_x, icon_cy - bracket_h),
            (left_tip_x, icon_cy),
            (left_back_x, icon_cy + bracket_h),
        ],
        fill=ACCENT,
        width=stroke_w,
        joint="curve",
    )
    # Right chevron "<"
    right_back_x = icon_cx + 50
    right_tip_x = right_back_x - bracket_w
    d.line(
        [
            (right_back_x, icon_cy - bracket_h),
            (right_tip_x, icon_cy),
            (right_back_x, icon_cy + bracket_h),
        ],
        fill=ACCENT,
        width=stroke_w,
        joint="curve",
    )

    # ── Vertical divider (subtle) ═══════════════════════════════
    d.line([(185, 60), (185, H - 60)], fill=DIVIDER, width=1)

    # ── Right section: product name + tagline ══════════════════
    title_font = ImageFont.truetype(FONT_BOLD, 36)
    tagline_font = ImageFont.truetype(FONT_REGULAR, 18)

    # Title: "Citation Nexus"
    title = "Citation Nexus"
    title_x = 210
    title_y = 100
    d.text((title_x, title_y), title, font=title_font, fill=TEXT)

    # Tagline (1-2 lines, short)
    tagline_lines = [
        "Highlight citations on any page.",
        "Diagonal-read in sentence blocks.",
    ]
    for i, line in enumerate(tagline_lines):
        y = title_y + 56 + i * 26
        d.text((title_x, y), line, font=tagline_font, fill=SUBTEXT)

    # ── Tiny accent mark in the corner (brand stamp) ═══════════
    # Small ">_<" mark in the bottom-right, hint of brand
    stamp_size = 18
    stamp_cx = W - 30
    stamp_cy = H - 30
    d.line(
        [
            (stamp_cx - stamp_size, stamp_cy - 6),
            (stamp_cx, stamp_cy),
            (stamp_cx - stamp_size, stamp_cy + 6),
        ],
        fill=ACCENT,
        width=3,
        joint="curve",
    )
    d.line(
        [
            (stamp_cx + stamp_size, stamp_cy - 6),
            (stamp_cx, stamp_cy),
            (stamp_cx + stamp_size, stamp_cy + 6),
        ],
        fill=ACCENT,
        width=3,
        joint="curve",
    )

    img.save(OUT_PATH, "PNG", optimize=True)
    with Image.open(OUT_PATH) as check:
        assert check.size == (W, H), f"promo tile wrong size: {check.size}"
        assert check.mode == "RGBA"
    print(f"wrote {OUT_PATH}")


if __name__ == "__main__":
    render()
