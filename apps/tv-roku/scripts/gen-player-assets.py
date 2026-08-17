"""Player-chrome assets for the Roku UI — the rounded glass-pill 9-patches + the bottom gradient scrim.

Pills STRETCH horizontally at a fixed height, so (unlike the circles) they ARE 9-patches: the rounded caps
stay fixed and the flat middle stretches. White masters, tinted at use time via Poster.blendColor. Re-run:
    python scripts/gen-player-assets.py

Consumers (keep in sync with PlayerChrome.bs):
  - pill-fill.9.png  → glass control-pill / chip background (height 54), tinted glass or accent.
  - pill-ring.9.png  → the pill's 1px border, tinted white@0.12 (idle) / blue@0.4 (focus).
  - pill-focus.9.png → the 2px focus ring (tinted blue@0.7) — tv-web's control boxShadow.
  - bar-fill.9.png   → the DVR scrubber segment bars + accent fill (height 8, radius 4).
  - scrim-player.png → the bottom gradient scrim (transparent top → rgba(6,10,20,0.92) bottom), stretched wide.
  - card.9.png       → rounded-rect 9-patch (radius 22) for the picker modal card + its selected rows, tinted.
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "images")
S = 4
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)


def pill_content(h, radius, stroke=None):
    """A white rounded pill (fill or 1px/2px stroke) rendered supersampled → downscaled. Cap = radius."""
    w = radius * 2 + 2
    big_w, big_h = w * S, h * S
    im = Image.new("RGBA", (big_w, big_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    box = [0, 0, big_w - 1, big_h - 1]
    if stroke is None:
        d.rounded_rectangle(box, radius=radius * S, fill=WHITE)
    else:
        # inset by half the stroke so the outline isn't clipped at the edge
        off = int(round(stroke * S / 2))
        d.rounded_rectangle([off, off, big_w - 1 - off, big_h - 1 - off], radius=radius * S, outline=WHITE, width=int(round(stroke * S)))
    return im.resize((w, h), Image.LANCZOS)


def make_9patch(content):
    """Wrap content in a 1px 9-patch frame: 1 stretchable column (top edge) + 1 stretchable row (left edge),
    both centred in the flat middle where stretching is invisible."""
    w, h = content.size
    im = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    im.paste(content, (1, 1))
    im.putpixel((1 + w // 2, 0), BLACK)   # top edge → horizontal stretch column
    im.putpixel((0, 1 + h // 2), BLACK)   # left edge → vertical stretch row
    return im


def scrim(h=360, w=8):
    """Vertical gradient matching tv-web: linear-gradient(to top, rgba(6,10,20,0.92) 25%,
    rgba(6,10,20,0.4) 65%, transparent). p = distance from the BOTTOM (0 bottom → 1 top)."""
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for y in range(h):
        p = (h - 1 - y) / (h - 1)
        if p <= 0.25:
            a = 0.92
        elif p <= 0.65:
            a = 0.92 - 0.52 * (p - 0.25) / 0.40
        else:
            a = 0.4 * (1.0 - (p - 0.65) / 0.35)
        alpha = int(max(0, min(255, round(a * 255))))
        for x in range(w):
            im.putpixel((x, y), (6, 10, 20, alpha))
    return im


def main():
    make_9patch(pill_content(54, 27)).save(os.path.join(OUT, "pill-fill.9.png"))
    make_9patch(pill_content(54, 27, stroke=1)).save(os.path.join(OUT, "pill-ring.9.png"))
    make_9patch(pill_content(54, 27, stroke=2)).save(os.path.join(OUT, "pill-focus.9.png"))
    make_9patch(pill_content(8, 4)).save(os.path.join(OUT, "bar-fill.9.png"))
    make_9patch(pill_content(48, 22)).save(os.path.join(OUT, "card.9.png"))   # rounded rect (2D-stretch)
    make_9patch(pill_content(28, 6)).save(os.path.join(OUT, "chip.9.png"))    # small r6 badge (meta/delivery)
    make_9patch(pill_content(22, 11)).save(os.path.join(OUT, "pill-sm.9.png"))  # small fully-rounded pill (badges)
    scrim().save(os.path.join(OUT, "scrim-player.png"))
    print("wrote pill-fill.9 / pill-ring.9 / pill-focus.9 / bar-fill.9 / card.9 / scrim-player.png")


if __name__ == "__main__":
    main()
