"""
Generate getairwave.tv's Open Graph / Twitter share image — the Airwave mark + "Airwave" wordmark + tagline on
the brand's dark navy radial gradient, at the standard OG size (1200x630). Mirrors the tv-native / tv-roku brand
generators (same gradient + lockup), using the site's own logo (public/logo.png) and the shared Inter font.

Next serves an `app/opengraph-image.png` (and `app/twitter-image.png`) automatically, adding the og:image /
twitter:image meta tags with the right dimensions — so running this drops the images straight into place. The
og:title/description/url + twitter card type live in app/layout.tsx's metadata.

Outputs (apps/site/app/):
  - opengraph-image.png   1200x630   og:image
  - twitter-image.png     1200x630   twitter:image
  - *.alt.txt             the image alt text (Next reads the sibling .alt.txt)

Run:  python apps/site/scripts/gen-og-image.py     (needs Pillow + numpy)
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)                             # apps/site
FONTS = os.path.join(os.path.dirname(SITE), "tv-roku", "fonts")  # shared brand font source
LOGO = os.path.join(SITE, "public", "logo.png")
OUT = os.path.join(SITE, "app")

# A tiny subtext that sits tight under the lockup so it reads as a caption to the wordmark (OG-image only).
SUBTEXT = "Turn your Plex library into live TV"
ALT = "Airwave — your Plex library as custom live TV"

# Same dark radial gradient as the app + the clients' brand art (lifted blue-navy -> #060a14).
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


def lockup(mark_h: int) -> Image.Image:
    """Horizontal 'mark + Airwave wordmark' lockup on transparent."""
    mw = int(mark_h * LOGO_AR)
    mark = logo.resize((mw, mark_h), Image.LANCZOS)
    font = ImageFont.truetype(os.path.join(FONTS, "Inter-Bold.ttf"), int(mark_h * 0.66))
    gap = int(mark_h * 0.22)
    bx = ImageDraw.Draw(Image.new("RGBA", (8, 8))).textbbox((0, 0), "Airwave", font=font)
    tw, th = bx[2] - bx[0], bx[3] - bx[1]
    lw, lh = mw + gap + tw, max(mark_h, th)
    img = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    img.paste(mark, (0, (lh - mark_h) // 2), mark)
    ImageDraw.Draw(img).text((mw + gap, (lh - th) // 2 - bx[1]), "Airwave", font=font, fill=(255, 255, 255, 255))
    return img


def make(name: str) -> None:
    W, H = 1200, 630
    bg = radial_bg(W, H)
    lk = lockup(150)
    # Tiny + tight so it reads as a subtext of the wordmark, not a separate line.
    sub_font = ImageFont.truetype(os.path.join(FONTS, "Inter-Medium.ttf"), 30)
    gap = 14
    draw = ImageDraw.Draw(bg)
    sb = draw.textbbox((0, 0), SUBTEXT, font=sub_font)
    sw, sh = sb[2] - sb[0], sb[3] - sb[1]
    top = (H - (lk.height + gap + sh)) // 2  # center the lockup + subtext as one unit
    bg.paste(lk, ((W - lk.width) // 2, top), lk)
    draw.text(((W - sw) // 2, top + lk.height + gap - sb[1]), SUBTEXT, font=sub_font, fill=(148, 163, 184, 255))  # slate-400
    bg.convert("RGB").save(os.path.join(OUT, name))
    with open(os.path.join(OUT, name.replace(".png", ".alt.txt")), "w", encoding="utf-8") as f:
        f.write(ALT)
    print(f"  {name:22s} {W}x{H}")


if __name__ == "__main__":
    print("getairwave.tv OG / Twitter share image:")
    make("opengraph-image.png")
    make("twitter-image.png")
    print(f"done -> {OUT}")
