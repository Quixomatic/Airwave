"""Generate the purpose-sized circle assets for the Roku UI (images/circle-<d>.png + ring-<d>.png).

Roku Posters can't render a crisp circle from a 9-patch (a 9-patch stretches its middle band, so a circle
distorts into a rounded-rect), and downscaling one big master aliases the edges/thin rings. So every circle
we draw is rendered as a WHITE master at its EXACT on-screen diameter (4x supersampled → LANCZOS), tinted at
use time via Poster.blendColor, and rendered 1:1 (no loadWidth needed).

⚠️ When you add a circle/ring at a NEW size, add it to FILLS / RINGS below and re-run this script:
    python scripts/gen-circles.py

Current consumers (keep this list in sync):
  - circle-36 / ring-36  → the tinted channel-icon circle (ChannelRow rail + FeaturedPanel), diameter
                            vw(64 * FEATURE_SCALE) = 36. ring-36 is the border (recolored blue on rail-focus).
  - circle-54 / ring-54  → GlassCircleButton (sidebar) fill + border, GB_SIZE = 54.
  - ring-62              → GlassCircleButton focus ring, GB_SIZE + GB_RING = 62 (thin, so it reads as a
                            separate ring outside the circle's own border rather than butting against it).
  - circle-96            → Diagnostic "done" disc.
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "images")
S = 4  # supersample factor
WHITE = (255, 255, 255, 255)

# Solid fill discs: diameter px.
#   16 / 24 → the player scrubber thumb (unfocused / focused), white.
#   34      → the scrubber thumb's focus HALO (24 + 2*5px), tinted accent@0.4 (tv-web boxShadow ring).
FILLS = [16, 24, 34, 36, 54, 96]
# Rings: (diameter px, stroke px at the target size). Borders are 1px (matches tv-web/native borderWidth:1);
# the glass focus ring is 2px so it reads as a distinct ring outside the button's own border.
RINGS = [(36, 1), (54, 1), (62, 2)]


def fill(d):
    big = d * S
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([0.5 * S, 0.5 * S, big - 0.5 * S - 1, big - 0.5 * S - 1], fill=WHITE)
    return im.resize((d, d), Image.LANCZOS)


def ring(d, stroke):
    big = d * S
    w = stroke * S
    off = w / 2 + 0.5 * S
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([off, off, big - off - 1, big - off - 1], outline=WHITE, width=int(round(w)))
    return im.resize((d, d), Image.LANCZOS)


def main():
    for d in FILLS:
        fill(d).save(os.path.join(OUT, f"circle-{d}.png"))
        print(f"wrote circle-{d}.png")
    for d, stroke in RINGS:
        ring(d, stroke).save(os.path.join(OUT, f"ring-{d}.png"))
        print(f"wrote ring-{d}.png (stroke {stroke})")


if __name__ == "__main__":
    main()
