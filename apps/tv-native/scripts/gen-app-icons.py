"""
Generate the Airwave app icons — the logo mark centered on a dark radial gradient.

Outputs (assets/icons/):
  - icon-ios.png            1024x1024   iOS / iPad square app icon (opaque, no alpha)
  - Apple TV brand assets (exact sizes required by @react-native-tvos/config-tv):
      tv-icon-small.png       400x240    tv-icon-small-2x.png     800x480
      tv-icon.png            1280x768    (App Store icon)
      tv-topshelf.png        1920x720    tv-topshelf-2x.png      3840x1440
      tv-topshelf-wide.png   2320x720    tv-topshelf-wide-2x.png 4640x1440

Run:  python scripts/gen-app-icons.py   (needs Pillow + numpy)
Wired in app.json (expo.ios.icon + the config-tv plugin's appleTVImages).
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, "assets", "logo.png")
OUT = os.path.join(ROOT, "assets", "icons")
os.makedirs(OUT, exist_ok=True)

# Dark radial gradient — a lifted blue-navy glow at center fading to the app's #060a14 background.
CENTER = np.array([22, 38, 66], dtype=np.float32)  # lifted blue-navy glow
EDGE = np.array([5, 8, 15], dtype=np.float32)  # ~#060a14


def radial_bg(w: int, h: int) -> Image.Image:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    # Reach full-dark a little before the far corner so the glow stays concentrated, not a flat wash.
    maxd = np.sqrt(cx * cx + cy * cy) * 0.82
    t = np.clip(dist / maxd, 0.0, 1.0) ** 1.15  # ease: hold the center brighter, fall off to edges
    rgb = CENTER * (1.0 - t[..., None]) + EDGE * t[..., None]
    return Image.fromarray(rgb.astype(np.uint8), "RGB")


logo = Image.open(LOGO).convert("RGBA")


def make(name: str, w: int, h: int, frac: float) -> None:
    bg = radial_bg(w, h)
    # Contain the logo within frac*w x frac*h, preserving aspect, centered.
    lw, lh = logo.size
    scale = min((w * frac) / lw, (h * frac) / lh)
    nw, nh = max(1, round(lw * scale)), max(1, round(lh * scale))
    resized = logo.resize((nw, nh), Image.LANCZOS)
    bg.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)  # logo alpha as the mask
    bg.save(os.path.join(OUT, name))
    print(f"  {name:26s} {w}x{h}")


print("iOS / iPad square:")
make("icon-ios.png", 1024, 1024, 0.62)

print("Apple TV brand assets:")
make("tv-icon-small.png", 400, 240, 0.66)
make("tv-icon-small-2x.png", 800, 480, 0.66)
make("tv-icon.png", 1280, 768, 0.66)
make("tv-topshelf.png", 1920, 720, 0.46)
make("tv-topshelf-2x.png", 3840, 1440, 0.46)
make("tv-topshelf-wide.png", 2320, 720, 0.42)
make("tv-topshelf-wide-2x.png", 4640, 1440, 0.42)
print("done")
