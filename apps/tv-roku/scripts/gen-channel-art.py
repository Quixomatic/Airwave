"""
Generate the Airwave **Roku channel art** — the logo mark (and, on splashes, the "Airwave" wordmark) on
the app's dark radial gradient, at every size the Roku manifest + Channel Store need. Mirrors the approach
in `apps/tv-native/scripts/gen-app-icons.py`, adapted to Roku's sizes.

Outputs (apps/tv-roku/images/) — these REPLACE the placeholder navy assets the manifest already points at:
  - icon_focus_hd.png    336x210    home-screen focus icon   (manifest `mm_icon_focus_hd`)
  - icon_focus_fhd.png   540x405    home-screen focus icon   (manifest `mm_icon_focus_fhd`)
  - splash_hd.png        1280x720   boot splash              (manifest `splash_screen_hd`)
  - splash_fhd.png       1920x1080  boot splash              (manifest `splash_screen_fhd`)
  - store-poster-hd.png  290x218    Channel Store poster     (upload in the Developer Dashboard)
  - store-poster-fhd.png 540x405    Channel Store poster     (upload in the Developer Dashboard)

⚠️ Roku's required art sizes DRIFT — verify against developer.roku.com's current "Channel Store art" /
"Application icons" spec before you submit. The two SIZES tables below are the single place to adjust.

Run:  python apps/tv-roku/scripts/gen-channel-art.py    (needs Pillow + numpy)
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, "images", "logo.png")
FONT = os.path.join(ROOT, "fonts", "Inter-Bold.ttf")
OUT = os.path.join(ROOT, "images")

# Dark radial gradient — the same lifted blue-navy glow → #060a14 as the app + the other clients' icons.
CENTER = np.array([22, 38, 66], dtype=np.float32)
EDGE = np.array([5, 8, 15], dtype=np.float32)

logo = Image.open(LOGO).convert("RGBA")
LOGO_AR = logo.size[0] / logo.size[1]  # 715/517 ≈ 1.383


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


def make_mark(name: str, w: int, h: int, frac: float) -> None:
    """Logo mark centered on the gradient (opaque)."""
    bg = radial_bg(w, h)
    resized, nw, nh = _fit(logo, w, h, frac)
    bg.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)
    bg.convert("RGB").save(os.path.join(OUT, name))
    print(f"  {name:22s} {w}x{h}  (mark)")


def _stacked(mark_h: int) -> Image.Image:
    """Vertical lockup: the logo mark with a centered white 'Airwave' wordmark BELOW it (transparent)."""
    mw = int(mark_h * LOGO_AR)
    mark = logo.resize((mw, mark_h), Image.LANCZOS)
    font = ImageFont.truetype(FONT, int(mark_h * 0.44))
    gap = int(mark_h * 0.16)
    bx = ImageDraw.Draw(Image.new("RGBA", (8, 8))).textbbox((0, 0), "Airwave", font=font)
    tw, th = bx[2] - bx[0], bx[3] - bx[1]
    lw, lh = max(mw, tw), mark_h + gap + th
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    img.paste(mark, ((lw - mw) // 2, 0), mark)
    ImageDraw.Draw(img).text(((lw - tw) // 2 - bx[0], mark_h + gap - bx[1]), "Airwave", font=font, fill=(255, 255, 255, 255))
    return img


def make_stacked(name: str, w: int, h: int, frac: float) -> None:
    """Mark-over-'Airwave' stacked lockup centered on the gradient (opaque) — the branded tile / store poster."""
    bg = radial_bg(w, h)
    resized, nw, nh = _fit(_stacked(240), w, h, frac)
    bg.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)
    bg.convert("RGB").save(os.path.join(OUT, name))
    print(f"  {name:22s} {w}x{h}  (mark + 'Airwave')")


def _lockup(mark_h: int) -> Image.Image:
    """Horizontal 'mark + Airwave wordmark' lockup on transparent — same shape as the boot LogoLockup."""
    mw = int(mark_h * LOGO_AR)
    mark = logo.resize((mw, mark_h), Image.LANCZOS)
    font = ImageFont.truetype(FONT, int(mark_h * 0.66))
    gap = int(mark_h * 0.20)
    d0 = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    bx = d0.textbbox((0, 0), "Airwave", font=font)
    tw, th = bx[2] - bx[0], bx[3] - bx[1]
    lw, lh = mw + gap + tw, max(mark_h, th)
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    img.paste(mark, (0, (lh - mark_h) // 2), mark)
    ImageDraw.Draw(img).text((mw + gap, (lh - th) // 2 - bx[1]), "Airwave", font=font, fill=(255, 255, 255, 255))
    return img


def make_lockup(name: str, w: int, h: int, frac: float) -> None:
    """Mark + wordmark centered on the gradient (opaque) — a branded still (unused for the splash now)."""
    bg = radial_bg(w, h)
    resized, nw, nh = _fit(_lockup(220), w, h, frac)
    bg.paste(resized, ((w - nw) // 2, (h - nh) // 2), resized)
    bg.convert("RGB").save(os.path.join(OUT, name))
    print(f"  {name:22s} {w}x{h}  (lockup)")


# The Roku OS splash shows BEFORE our code runs; the app then plays the animated LogoLockup on a FLAT
# #060a14 background (BootSplash bg). So the splash is a PLAIN #060a14 fill — no logo — and the animation
# fades the wordmark up from black seamlessly (rather than flashing a big static logo). Roku requires a
# splash image; this makes it invisible-as-a-handoff.
BG = (6, 10, 20)  # #060a14 — matches BootSplash's Rectangle bg exactly


def make_flat(name: str, w: int, h: int) -> None:
    Image.new("RGB", (w, h), BG).save(os.path.join(OUT, name))
    print(f"  {name:22s} {w}x{h}  (flat #060a14 — seamless handoff to the animated splash)")


# name, width, height, logo-fraction-of-canvas
ICONS = [
    ("icon_focus_hd.png", 336, 210, 0.80),
    ("icon_focus_fhd.png", 540, 405, 0.76),
    ("store-poster-hd.png", 290, 218, 0.80),
    ("store-poster-fhd.png", 540, 405, 0.76),
]
SPLASHES = [
    ("splash_hd.png", 1280, 720, 0.44),
    ("splash_fhd.png", 1920, 1080, 0.44),
]

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("Roku channel icons + store posters (mark + 'Airwave' wordmark below):")
    for name, w, h, frac in ICONS:
        make_stacked(name, w, h, frac)
    print("Roku boot splashes (flat #060a14 — the animated LogoLockup does the branding):")
    for name, w, h, _frac in SPLASHES:
        make_flat(name, w, h)
    print("done — verify sizes at developer.roku.com's Channel Store art spec before submitting")
