"""
Generate the Airwave browser-tab favicons — the logo mark centered on the same dark radial gradient as the
native app icons (mirrors apps/tv-native/scripts/gen-app-icons.py). Writes into the web + tv-web public dirs.

Outputs (into each app's public/):
  - favicon.ico            (16 / 32 / 48 multi-size — the browser tab icon)
  - favicon-32x32.png      (modern PNG favicon)
  - apple-touch-icon.png   180x180 (iOS home-screen / bookmark)

Run:  python scripts/gen-favicons.py     (needs Pillow + numpy)
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, "apps", "tv-native", "assets", "logo.png")
TARGETS = [
    os.path.join(ROOT, "apps", "web", "public"),
    os.path.join(ROOT, "apps", "tv-web", "public"),
]

# Same dark blue-navy radial glow as the native app icons (center → #060a14 edge).
CENTER = np.array([22, 38, 66], dtype=np.float32)
EDGE = np.array([5, 8, 15], dtype=np.float32)


def radial_bg(w: int, h: int) -> Image.Image:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    maxd = np.sqrt(cx * cx + cy * cy) * 0.82
    t = np.clip(dist / maxd, 0.0, 1.0) ** 1.15
    rgb = CENTER * (1.0 - t[..., None]) + EDGE * t[..., None]
    return Image.fromarray(rgb.astype(np.uint8), "RGB")


logo = Image.open(LOGO).convert("RGBA")


def icon(size: int, frac: float = 0.72) -> Image.Image:
    """The logo mark centered on the dark radial gradient (opaque), sized `size`x`size`."""
    bg = radial_bg(size, size)
    lw, lh = logo.size
    scale = min((size * frac) / lw, (size * frac) / lh)
    nw, nh = max(1, round(lw * scale)), max(1, round(lh * scale))
    resized = logo.resize((nw, nh), Image.LANCZOS)
    bg.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    return bg


# A crisp 256 master; the .ico embeds downscaled 16/32/48 from it.
master = icon(256)

for pub in TARGETS:
    os.makedirs(pub, exist_ok=True)
    master.save(os.path.join(pub, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    icon(32).save(os.path.join(pub, "favicon-32x32.png"))
    icon(180).save(os.path.join(pub, "apple-touch-icon.png"))
    print(f"  wrote favicon.ico / favicon-32x32.png / apple-touch-icon.png -> {pub}")
print("done")
