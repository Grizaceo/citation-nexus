#!/usr/bin/env python3
"""Draw the Citation Nexus icon set (4 sizes).

Design: two thick angle brackets ">" and "<" facing each other,
forming a citation/reference mark. Single solid color (#3aa1ff)
on a fully transparent background.

Rendered as a single thick polyline per bracket. Round caps and
round joins produce clean ends and a smooth tip. The shape is
tuned so the "tip" of each chevron is significantly to the
inside of the icon (at ~55% of the icon width for the left
bracket), giving the "><" pair the recognizable "facing each
other" look at all sizes including 16 px.
"""

from PIL import Image, ImageDraw
import os

SIZES = [16, 32, 48, 128]
COLOR = (58, 161, 255, 255)  # #3aa1ff, fully opaque
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "..", "public")


def bracket_polyline(size: int, side: str) -> tuple[list[tuple[int, int]], int]:
    """Return (polyline, stroke_width) for one bracket.

    Polyline is the centerline: back-top → tip → back-bottom.
    The tip points horizontally toward the icon center.
    """
    # Outer padding from the icon edge (so the mark doesn't touch the border)
    pad = max(1, int(round(size * 0.18)))
    # Half-height of the back arm (how tall the back of the chevron is)
    back_y_offset = max(2, int(round(size * 0.30)))
    # Where the chevron's tip sits (fraction of the icon width)
    tip_x_factor = 0.55  # 55% of the icon width
    # Stroke width
    stroke = max(2, int(round(size * 0.14)))

    mid_y = size // 2

    if side == "left":
        # ">" bracket: back on the left, tip points right
        back_x = pad
        tip_x = int(round(size * tip_x_factor))
        polyline = [
            (back_x, mid_y - back_y_offset),  # back top
            (tip_x, mid_y),                    # tip (right)
            (back_x, mid_y + back_y_offset),  # back bottom
        ]
    else:
        # "<" bracket: back on the right, tip points left (mirror)
        back_x = size - pad
        tip_x = int(round(size * (1.0 - tip_x_factor)))
        polyline = [
            (back_x, mid_y - back_y_offset),  # back top
            (tip_x, mid_y),                    # tip (left)
            (back_x, mid_y + back_y_offset),  # back bottom
        ]
    return polyline, stroke


def draw_icon(size: int) -> Image.Image:
    """Render the icon (both brackets) at the given size."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))  # fully transparent
    d = ImageDraw.Draw(img)
    left_line, left_stroke = bracket_polyline(size, "left")
    right_line, right_stroke = bracket_polyline(size, "right")
    d.line(left_line, fill=COLOR, width=left_stroke, joint="curve")
    d.line(right_line, fill=COLOR, width=right_stroke, joint="curve")
    return img


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for s in SIZES:
        img = draw_icon(s)
        out_path = os.path.join(OUT_DIR, f"icon-{s}.png")
        img.save(out_path, "PNG", optimize=True)
        with Image.open(out_path) as check:
            assert check.mode == "RGBA", f"icon-{s}.png lost alpha"
            assert check.size == (s, s), f"icon-{s}.png wrong size"
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
