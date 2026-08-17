"""Bumper countdown-donut frames for the Roku BumperCard — a draining accent ring (full → empty), one PNG
per step (Roku has no SVG, so we pre-render frames and pick the nearest by fraction). White masters tinted at
use via Poster.blendColor. Plus donut-track.png (the faint full ring behind). Re-run:
    python scripts/gen-donut.py

Consumer: components/watch/BumperCard.bs — size 190, stroke 9 (the full-screen "Coming up next" card).
"""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "images")
S = 4
SIZE = 190
STROKE = 9
STEPS = 100   # one frame per percent (0–100) so the drain is smooth, not stepped
WHITE = (255, 255, 255, 255)


def arc_frame(frac):
    big = SIZE * S
    w = STROKE * S
    off = w / 2 + 1
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    if frac > 0:
        # drain clockwise from the top (12 o'clock = -90°)
        ImageDraw.Draw(im).arc([off, off, big - off - 1, big - off - 1], start=-90, end=-90 + frac * 360, fill=WHITE, width=int(round(w)))
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def track():
    big = SIZE * S
    w = STROKE * S
    off = w / 2 + 1
    im = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([off, off, big - off - 1, big - off - 1], outline=WHITE, width=int(round(w)))
    return im.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    for i in range(STEPS + 1):
        arc_frame(i / STEPS).save(os.path.join(OUT, f"donut-{i}.png"))
    track().save(os.path.join(OUT, "donut-track.png"))
    print(f"wrote donut-0..{STEPS} + donut-track")


if __name__ == "__main__":
    main()
