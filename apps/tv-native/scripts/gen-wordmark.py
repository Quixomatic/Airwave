"""
Generate Airwave WORDMARK brand assets — the logo mark + "Airwave" in white, matching tv-web's
`Logo` component (src/lib/logo.tsx): Inter Bold, #fff, fontSize = 0.66 * markWidth, gap =
0.16 * markWidth, letter-spacing -0.01em. Composited on the same dark radial gradient as
gen-app-icons.py.

Outputs:
  assets/brand/
    wordmark-row.png / wordmark-row-transparent.png        mark + "Airwave" side by side
    wordmark-column.png / wordmark-column-transparent.png   mark above, "Airwave" centered below
    splash.gif / splash.webp                                the tv-web login splash animation
                                                            (mark fades+scales in, letters cascade)
  assets/icons/  (REGENERATED with the inline wordmark — Apple TV top shelf shows no app name)
    tv-topshelf.png tv-topshelf-2x.png tv-topshelf-wide.png tv-topshelf-wide-2x.png

Run:  python scripts/gen-wordmark.py     (needs Pillow + numpy, and ffmpeg on PATH for gif/webp)
"""
import os
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, "assets", "logo.png")
FONT = os.path.join(ROOT, "assets", "fonts", "Inter-Bold.ttf")
BRAND = os.path.join(ROOT, "assets", "brand")
ICONS = os.path.join(ROOT, "assets", "icons")
os.makedirs(BRAND, exist_ok=True)

APP_NAME = "Airwave"
WHITE = (255, 255, 255, 255)

CENTER = np.array([22, 38, 66], dtype=np.float32)  # dark radial gradient — identical to gen-app-icons.py
EDGE = np.array([5, 8, 15], dtype=np.float32)


def radial_bg(w: int, h: int) -> Image.Image:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    maxd = np.sqrt(cx * cx + cy * cy) * 0.82
    t = np.clip(dist / maxd, 0.0, 1.0) ** 1.15
    rgb = CENTER * (1.0 - t[..., None]) + EDGE * t[..., None]
    return Image.fromarray(rgb.astype(np.uint8), "RGB").convert("RGBA")


logo = Image.open(LOGO).convert("RGBA")
LOGO_ASPECT = logo.height / logo.width  # 517/715


def mark_img(mark_width: int) -> Image.Image:
    return logo.resize((mark_width, max(1, round(mark_width * LOGO_ASPECT))), Image.LANCZOS)


def word_and_letters(font_size: int):
    """Return (word_img, [per-letter layers], font_size). Every letter layer is the SAME size as
    word_img and holds exactly one glyph at its final position — so animating a letter is just a
    per-layer opacity + y-offset, with the baseline/spacing guaranteed consistent."""
    font = ImageFont.truetype(FONT, font_size)
    tracking = round(-0.01 * font_size)  # letter-spacing: -0.01em
    advances = [font.getlength(c) for c in APP_NAME]
    pad = font_size
    W = int(sum(advances) + tracking * (len(APP_NAME) - 1) + pad * 2)
    H = int(font_size * 2.2)
    full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layers = []
    x, y = float(pad), int(font_size * 0.5)
    for i, c in enumerate(APP_NAME):
        ImageDraw.Draw(full).text((x, y), c, font=font, fill=WHITE)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(layer).text((x, y), c, font=font, fill=WHITE)
        layers.append(layer)
        x += advances[i] + tracking
    bbox = full.getbbox()
    return full.crop(bbox), [layer.crop(bbox) for layer in layers]


def compose(mark_width: int, layout: str) -> Image.Image:
    """The static wordmark (mark + Airwave) as a tight RGBA image, matching Logo's proportions."""
    gap = round(mark_width * 0.16)
    m = mark_img(mark_width)
    word, _ = word_and_letters(round(mark_width * 0.66))
    if layout == "row":
        w, h = m.width + gap + word.width, max(m.height, word.height)
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        img.alpha_composite(m, (0, (h - m.height) // 2))
        img.alpha_composite(word, (m.width + gap, (h - word.height) // 2))
    else:  # column
        w, h = max(m.width, word.width), m.height + gap + word.height
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        img.alpha_composite(m, ((w - m.width) // 2, 0))
        img.alpha_composite(word, ((w - word.width) // 2, m.height + gap))
    return img


def on_gradient(content: Image.Image, w: int, h: int, frac: float) -> Image.Image:
    bg = radial_bg(w, h)
    scale = min((w * frac) / content.width, (h * frac) / content.height)
    c = content.resize((max(1, round(content.width * scale)), max(1, round(content.height * scale))), Image.LANCZOS)
    bg.alpha_composite(c, ((w - c.width) // 2, (h - c.height) // 2))
    return bg.convert("RGB")


def save(img: Image.Image, name: str, folder: str = BRAND) -> None:
    img.save(os.path.join(folder, name))
    print(f"  {name:34s} {img.width}x{img.height}")


# ---- Static wordmarks ---------------------------------------------------------
print("Static wordmarks (assets/brand/):")
for layout in ("row", "column"):
    content = compose(520, layout)
    save(content, f"wordmark-{layout}-transparent.png")
    save(on_gradient(content, 1600, 600, 0.82) if layout == "row" else on_gradient(content, 1200, 1200, 0.68),
         f"wordmark-{layout}.png")

# ---- Apple TV top shelf (inline wordmark — top shelf shows no app name) --------
print("Top shelf w/ inline wordmark (assets/icons/):")
row = compose(520, "row")
for name, w, h, frac in [
    ("tv-topshelf.png", 1920, 720, 0.70),
    ("tv-topshelf-2x.png", 3840, 1440, 0.70),
    ("tv-topshelf-wide.png", 2320, 720, 0.64),
    ("tv-topshelf-wide-2x.png", 4640, 1440, 0.64),
]:
    save(on_gradient(row, w, h, frac), name, ICONS)


# ---- Splash animation (row layout, matching the tv-web login) -----------------
def ease(t: float) -> float:
    """cubic-bezier(0.22, 1, 0.36, 1) — the Logo transition. Solve x(p)=t (bisection), return y(p)."""
    if t <= 0:
        return 0.0
    if t >= 1:
        return 1.0

    def bez(p, a, b):
        mp = 1 - p
        return 3 * mp * mp * p * a + 3 * mp * p * p * b + p * p * p

    lo, hi = 0.0, 1.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if bez(mid, 0.22, 0.36) < t:
            lo = mid
        else:
            hi = mid
    return bez((lo + hi) / 2, 1.0, 1.0)


def blend(base: Image.Image, layer: Image.Image, xy, opacity: float) -> None:
    if opacity <= 0:
        return
    mask = layer.split()[3].point(lambda v: int(v * min(opacity, 1.0)))
    base.paste(layer, xy, mask)


def render_splash(mark_width: int, fps: int):
    font_size = round(mark_width * 0.66)
    gap = round(mark_width * 0.16)
    m = mark_img(mark_width)
    word, layers = word_and_letters(font_size)

    content_w, content_h = m.width + gap + word.width, max(m.height, word.height)
    pad = round(mark_width * 0.85)
    W = (content_w + pad * 2) & ~1
    H = (content_h + pad * 2) & ~1
    ox, cy = (W - content_w) // 2, H // 2
    mark_cx = ox + m.width // 2
    word_x = ox + m.width + gap
    word_top = cy - word.height // 2

    MARK_DUR, L_START, L_STEP, L_DUR = 0.5, 0.35, 0.055, 0.4
    total = L_START + (len(APP_NAME) - 1) * L_STEP + L_DUR + 0.9  # + hold before loop
    frames = []
    for f in range(int(round(total * fps))):
        t = f / fps
        fr = radial_bg(W, H)
        me = ease(min(t / MARK_DUR, 1.0))  # mark: opacity 0→1, scale 0.82→1
        scale = 0.82 + 0.18 * me
        mw, mh = max(1, round(m.width * scale)), max(1, round(m.height * scale))
        blend(fr, m.resize((mw, mh), Image.LANCZOS), (mark_cx - mw // 2, cy - mh // 2), me)
        for i, layer in enumerate(layers):  # letters cascade: opacity 0→1, y 0.35em→0
            le = ease(min(max((t - (L_START + i * L_STEP)) / L_DUR, 0.0), 1.0))
            yoff = round((1 - le) * 0.35 * font_size)
            blend(fr, layer, (word_x, word_top + yoff), le)
        frames.append(fr.convert("RGB"))
    return frames


print("Splash animation (assets/brand/):")
fps = 25
frames = render_splash(200, fps)
tmp = os.path.join(BRAND, "_frames")
os.makedirs(tmp, exist_ok=True)
for i, fr in enumerate(frames):
    fr.save(os.path.join(tmp, f"f{i:03d}.png"))

common = ["-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(tmp, "f%03d.png")]
subprocess.run(["ffmpeg", *common, "-vf",
                "split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=sierra2_4a",
                "-loop", "0", os.path.join(BRAND, "splash.gif")], check=True)
subprocess.run(["ffmpeg", *common, "-c:v", "libwebp_anim", "-quality", "82", "-loop", "0",
                os.path.join(BRAND, "splash.webp")], check=True)
shutil.rmtree(tmp, ignore_errors=True)
for nm in ("splash.gif", "splash.webp"):
    print(f"  {nm:34s} {os.path.getsize(os.path.join(BRAND, nm)) / 1e6:.2f} MB  ({len(frames)} frames @ {fps}fps)")

print("done")
