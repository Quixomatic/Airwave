"""
Generate the Airwave **Amazon Appstore (Fire TV + tablet) graphics** at Amazon's required sizes — the logo
mark / "Airwave" wordmark lockup on the app's dark radial gradient. Mirrors gen-play-store-art.py, reusing
the shared Roku logo + Inter font. Upload by hand in the Amazon Developer Console.

Outputs (apps/tv-native/cert/amazon-assets/):
  Fire TV:
  - firetv-app-icon-1280x720.png        1280x720   App icon (no transparency)
  - firetv-background-1920x1080.png      1920x1080  Background image (no transparency)
  - firetv-featured-logo-640x260.png     640x260    Featured content logo (TRANSPARENT)
  - firetv-featured-background-1920x720   1920x720   Featured content background (no transparency)
  Tablet:
  - tablet-icon-114.png                  114x114    small icon (transparency)

Reuse from cert/play-assets/ (don't regenerate):
  - Fire TV / tablet 512x512 icon        -> store-icon-512.png
  - Tablet promotional image 1024x500    -> feature-graphic-1024x500.png
  - Fire TV / tablet screenshots 1920x1080 -> the screenshot-*.png / appletv-*.png set

Run:  python apps/tv-native/scripts/gen-amazon-art.py     (needs Pillow + numpy)
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                                  # apps/tv-native
ROKU = os.path.join(os.path.dirname(ROOT), "tv-roku")         # shared brand source
LOGO = os.path.join(ROKU, "images", "logo.png")
FONT = os.path.join(ROKU, "fonts", "Inter-Bold.ttf")
OUT = os.path.join(ROOT, "cert", "amazon-assets")

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


def make_lockup_bg(name: str, w: int, h: int, frac: float) -> None:
    """Mark + wordmark centered on the gradient (opaque, no alpha)."""
    bg = radial_bg(w, h)
    resized, nw, nh = _fit(_lockup(240), w, h, frac)
    bg.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)
    bg.convert("RGB").save(os.path.join(OUT, name))
    print(f"  {name:34s} {w}x{h}  (lockup on gradient, no alpha)")


def make_mark_icon(name: str, size: int, frac: float) -> None:
    """Square mark centered on the gradient (RGBA / transparency-capable, opaque)."""
    bg = radial_bg(size, size)
    resized, nw, nh = _fit(logo, size, size, frac)
    bg.paste(resized, ((size - nw) // 2, (size - nh) // 2), resized)
    bg.save(os.path.join(OUT, name))
    print(f"  {name:34s} {size}x{size}  (mark on gradient, 32-bit)")


def make_transparent_logo(name: str, w: int, h: int, frac: float) -> None:
    """Mark + wordmark on a TRANSPARENT canvas (for the featured-content logo)."""
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    resized, nw, nh = _fit(_lockup(240), w, h, frac)
    canvas.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)
    canvas.save(os.path.join(OUT, name))
    print(f"  {name:34s} {w}x{h}  (lockup, TRANSPARENT)")


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("Airwave Amazon Appstore graphics (Fire TV + tablet):")
    # Fire TV
    make_lockup_bg("firetv-app-icon-1280x720.png", 1280, 720, 0.60)
    make_lockup_bg("firetv-background-1920x1080.png", 1920, 1080, 0.42)
    make_transparent_logo("firetv-featured-logo-640x260.png", 640, 260, 0.90)
    make_lockup_bg("firetv-featured-background-1920x720.png", 1920, 720, 0.50)
    # Tablet
    make_mark_icon("tablet-icon-114.png", 114, 0.70)
    print(f"done -> {OUT}")
    print("Reuse store-icon-512.png (512 icon) + feature-graphic-1024x500.png (promo) + the 1920x1080 screenshots from cert/play-assets/.")
