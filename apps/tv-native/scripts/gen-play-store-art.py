"""
Generate the Airwave **Google Play store-listing graphics** — the logo mark (and, on the wide graphics, the
"Airwave" wordmark) on the app's dark radial gradient, at the sizes Play Console requires for a TV app.
Mirrors apps/tv-roku/scripts/gen-channel-art.py (same gradient + lockup), reusing the Roku logo + Inter font.

These are the LISTING graphics you upload by hand in Play Console — SEPARATE from the app-embedded icons
(the launcher/adaptive icon + the 320x180 leanback banner already ship inside the AAB via app.json).

Outputs (apps/tv-native/cert/play-assets/):
  - store-icon-512.png        512x512     Play "hi-res icon"      (32-bit PNG; Store listing > App icon)
  - feature-graphic-1024x500  1024x500    Play "Feature graphic"  (no alpha; required for a TV listing)
  - tv-banner-1280x720.png    1280x720    Play "TV banner"        (16:9; Store listing > TV banner)

Screenshots are NOT generated here — reuse the Apple TV 16:9 captures (1920x1080 / 3840x2160).

⚠️ Play's required sizes/formats can drift — verify against the Play Console listing spec before uploading.

Run:  python apps/tv-native/scripts/gen-play-store-art.py     (needs Pillow + numpy)
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                                  # apps/tv-native
ROKU = os.path.join(os.path.dirname(ROOT), "tv-roku")         # apps/tv-roku (shared brand source)
LOGO = os.path.join(ROKU, "images", "logo.png")
FONT = os.path.join(ROKU, "fonts", "Inter-Bold.ttf")
OUT = os.path.join(ROOT, "cert", "play-assets")

# Same dark radial gradient as the app + the other clients' icons (lifted blue-navy → #060a14).
CENTER = np.array([22, 38, 66], dtype=np.float32)
EDGE = np.array([5, 8, 15], dtype=np.float32)

logo = Image.open(LOGO).convert("RGBA")
LOGO_AR = logo.size[0] / logo.size[1]


def radial_bg(w: int, h: int) -> Image.Image:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    maxd = np.sqrt(cx * cx + cy * cy) * 0.82
    t = np.clip(dist / maxd, 0.0, 1.0) ** 1.15
    rgb = CENTER * (1.0 - t[..., None]) + EDGE * t[..., None]
    return Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")


def _fit(img: Image.Image, w: int, h: int, frac: float):
    scale = min((w * frac) / img.width, (h * frac) / img.height)
    nw, nh = max(1, round(img.width * scale)), max(1, round(img.height * scale))
    return img.resize((nw, nh), Image.LANCZOS), nw, nh


def _lockup(mark_h: int) -> Image.Image:
    """Horizontal 'mark + Airwave wordmark' lockup on transparent."""
    mw = int(mark_h * LOGO_AR)
    mark = logo.resize((mw, mark_h), Image.LANCZOS)
    font = ImageFont.truetype(FONT, int(mark_h * 0.66))
    gap = int(mark_h * 0.20)
    bx = ImageDraw.Draw(Image.new("RGBA", (8, 8))).textbbox((0, 0), "Airwave", font=font)
    tw, th = bx[2] - bx[0], bx[3] - bx[1]
    lw, lh = mw + gap + tw, max(mark_h, th)
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    img.paste(mark, (0, (lh - mark_h) // 2), mark)
    ImageDraw.Draw(img).text((mw + gap, (lh - th) // 2 - bx[1]), "Airwave", font=font, fill=(255, 255, 255, 255))
    return img


def make_icon_512(name: str) -> None:
    """Square hi-res store icon — mark centered on the gradient. Saved 32-bit PNG (opaque)."""
    w = h = 512
    bg = radial_bg(w, h)
    resized, nw, nh = _fit(logo, w, h, 0.66)
    bg.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)
    bg.save(os.path.join(OUT, name))  # keep RGBA → 32-bit PNG as Play wants
    print(f"  {name:28s} {w}x{h}  (mark, 32-bit)")


def make_lockup(name: str, w: int, h: int, frac: float) -> None:
    """Mark + 'Airwave' wordmark centered on the gradient (opaque, no alpha) — feature graphic / TV banner."""
    bg = radial_bg(w, h)
    resized, nw, nh = _fit(_lockup(240), w, h, frac)
    bg.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)
    bg.convert("RGB").save(os.path.join(OUT, name))  # RGB → no transparency (Play rejects alpha here)
    print(f"  {name:28s} {w}x{h}  (mark + 'Airwave', no alpha)")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("Airwave Google Play store-listing graphics:")
    make_icon_512("store-icon-512.png")
    make_lockup("feature-graphic-1024x500.png", 1024, 500, 0.62)
    make_lockup("tv-banner-1280x720.png", 1280, 720, 0.58)
    print(f"done -> {OUT}")
    print("Upload in Play Console > Store listing. Screenshots: reuse the Apple TV 16:9 captures.")
