"""
Generate Airwave webOS (LG Content Store) submission assets — parity with tv-native's gen-app-icons.py.

Outputs to apps/tv-web/cert/ (gitignored — store-submission material is local-only):
  - store-icon-512.png   512x512    LG store-listing icon (LG requires >=400x400); the logo mark centered
                                     on the app's dark radial gradient, same look as every other Airwave icon.
  - splash-1080.png      1920x1080  flat #060a14 launcher/splash background. The app renders its own animated
                                     splash, so this is just the plain background — nothing flashes before it
                                     (same approach as the tv-roku flat splash).

Optional — scale store screenshots to 1920x1080 (max-quality LANCZOS, lossless PNG) into cert/screenshots/:
  python scripts/gen-webos-assets.py --screenshots "C:\\path\\to\\pngs"

Run:
  python scripts/gen-webos-assets.py                       # icon + splash
  python scripts/gen-webos-assets.py --screenshots <dir>   # + scale screenshots
Needs Pillow + numpy.
"""
import argparse
import glob
import os

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None  # allow big 4K source screenshots

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))  # repo root
OUT = os.path.abspath(os.path.join(HERE, "..", "cert"))
SHOTS = os.path.join(OUT, "screenshots")
SAMSUNG = os.path.join(OUT, "samsung")  # Samsung TV Seller Office assets
SAMSUNG_SHOTS = os.path.join(SAMSUNG, "screenshots")
BG = (6, 10, 20)  # #060a14 — the app background

# Dark radial gradient (matches gen-app-icons.py / gen-channel-art.py).
CENTER = np.array([22, 38, 66], dtype=np.float32)
EDGE = np.array([5, 8, 15], dtype=np.float32)


def find_logo() -> str:
    for p in ("apps/tv-native/assets/logo.png", "apps/site/public/logo.png", "apps/tv-roku/images/logo.png"):
        fp = os.path.join(ROOT, p)
        if os.path.exists(fp):
            return fp
    raise FileNotFoundError("Airwave logo.png not found in the usual places")


def radial_bg(w: int, h: int) -> Image.Image:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    maxd = np.sqrt(cx * cx + cy * cy) * 0.82
    t = np.clip(dist / maxd, 0.0, 1.0) ** 1.15
    rgb = CENTER * (1.0 - t[..., None]) + EDGE * t[..., None]
    return Image.fromarray(rgb.astype(np.uint8), "RGB")


def gen_icon(size: int = 512, frac: float = 0.62) -> None:
    logo = Image.open(find_logo()).convert("RGBA")
    lw, lh = logo.size
    s = min((size * frac) / lw, (size * frac) / lh)
    r = logo.resize((max(1, round(lw * s)), max(1, round(lh * s))), Image.LANCZOS)
    bg = radial_bg(size, size)
    bg.paste(r, ((size - r.width) // 2, (size - r.height) // 2), r)
    bg.save(os.path.join(OUT, "store-icon-512.png"))
    print(f"  store-icon-512.png   {size}x{size}")


def gen_splash(w: int = 1920, h: int = 1080) -> None:
    Image.new("RGB", (w, h), BG).save(os.path.join(OUT, "splash-1080.png"))
    print(f"  splash-1080.png      {w}x{h}  (flat #060a14)")


def scale_screenshots(src: str, w: int = 1920, h: int = 1080) -> None:
    os.makedirs(SHOTS, exist_ok=True)
    # dedupe: on a case-insensitive FS, *.png and *.PNG return the same files
    files = sorted({os.path.normcase(p) for p in glob.glob(os.path.join(src, "*.png")) + glob.glob(os.path.join(src, "*.PNG"))})
    if not files:
        print(f"  (no PNGs found in {src})")
        return
    for i, f in enumerate(files, 1):
        im = Image.open(f).convert("RGB")
        ow, oh = im.size
        # Fit within WxH preserving aspect, then pad to EXACTLY WxH with the app bg (stores want the exact size).
        im.thumbnail((w, h), Image.LANCZOS)
        canvas = Image.new("RGB", (w, h), BG)
        canvas.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
        canvas.save(os.path.join(SHOTS, f"screenshot-{i:02d}.png"))
        print(f"  screenshots/screenshot-{i:02d}.png   {w}x{h}  (from {ow}x{oh})")


# ── Samsung TV Seller Office assets ────────────────────────────────────────────────
# Samsung's "Icon Images" want a TRANSPARENT logo asset + a background (it auto-generates the 16:9 / 1:1
# tiles from them), plus a separate NON-SQUARE 512x423 full-color icon. Screenshots must be JPG <=500kb.
# Everything <=300kb (icons/bg) per the Seller Office limits.

def _report(path: str, limit_kb: int) -> None:
    kb = os.path.getsize(path) / 1024
    flag = "" if kb <= limit_kb else f"   !! {kb:.0f}kb > {limit_kb}kb limit"
    print(f"  {os.path.relpath(path, OUT)}   {kb:.0f}kb{flag}")


def gen_samsung_logo(w: int = 1920, h: int = 1080, frac_w: float = 0.5, frac_h: float = 0.42) -> None:
    """1920x1080 32-bit PNG (RGBA) — the logo mark centered on a fully TRANSPARENT canvas (Samsung composites
    it over the background you upload, and auto-generates the 16:9 + 1:1 tiles)."""
    logo = Image.open(find_logo()).convert("RGBA")
    lw, lh = logo.size
    s = min((w * frac_w) / lw, (h * frac_h) / lh)
    r = logo.resize((max(1, round(lw * s)), max(1, round(lh * s))), Image.LANCZOS)
    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(r, ((w - r.width) // 2, (h - r.height) // 2), r)
    p = os.path.join(SAMSUNG, "logo-1920.png")
    canvas.save(p, optimize=True)
    _report(p, 300)


def gen_samsung_background(w: int = 1920, h: int = 1080) -> None:
    """1920x1080 24-bit background — the flat app color (same as the webOS splash)."""
    p = os.path.join(SAMSUNG, "background-1920.png")
    Image.new("RGB", (w, h), BG).save(p, optimize=True)
    _report(p, 300)


def gen_samsung_icon(w: int = 512, h: int = 423, frac: float = 0.62) -> None:
    """512x423 full-color asset — logo on the dark radial gradient (non-square, unlike the webOS 512x512)."""
    logo = Image.open(find_logo()).convert("RGBA")
    lw, lh = logo.size
    s = min((w * frac) / lw, (h * frac) / lh)
    r = logo.resize((max(1, round(lw * s)), max(1, round(lh * s))), Image.LANCZOS)
    bg = radial_bg(w, h)
    bg.paste(r, ((w - r.width) // 2, (h - r.height) // 2), r)
    p = os.path.join(SAMSUNG, "icon-512x423.png")
    bg.save(p, optimize=True)
    _report(p, 300)


def samsung_screenshots(limit_kb: int = 500) -> None:
    """Re-encode the already-scaled cert/screenshots/*.png to JPG <=500kb (Samsung wants JPG, not PNG)."""
    os.makedirs(SAMSUNG_SHOTS, exist_ok=True)
    files = sorted({os.path.normcase(p) for p in glob.glob(os.path.join(SHOTS, "*.png"))})
    if not files:
        print(f"  (no PNG screenshots in {SHOTS} — run the webOS --screenshots step first)")
        return
    for f in files:
        im = Image.open(f).convert("RGB")
        base = os.path.splitext(os.path.basename(f))[0]
        out = os.path.join(SAMSUNG_SHOTS, f"{base}.jpg")
        q = 92
        while q >= 40:
            im.save(out, "JPEG", quality=q, optimize=True, progressive=True)
            if os.path.getsize(out) <= limit_kb * 1024:
                break
            q -= 4
        _report(out, limit_kb)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--screenshots", help="folder of PNG screenshots to scale to 1920x1080 into cert/screenshots/")
    ap.add_argument("--samsung", action="store_true", help="generate Samsung TV Seller Office assets into cert/samsung/")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if args.samsung:
        os.makedirs(SAMSUNG, exist_ok=True)
        print(f"Samsung TV assets -> {SAMSUNG}")
        gen_samsung_logo()
        gen_samsung_background()
        gen_samsung_icon()
        print("screenshots (PNG -> JPG <=500kb):")
        samsung_screenshots()
        print("done")
    else:
        print(f"webOS assets -> {OUT}")
        gen_icon()
        gen_splash()
        if args.screenshots:
            print("scaling screenshots:")
            scale_screenshots(args.screenshots)
        print("done")
