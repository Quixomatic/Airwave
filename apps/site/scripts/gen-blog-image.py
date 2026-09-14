"""
Generate a branded blog FEATURED image: a screenshot blurred + darkened into a moody backdrop, with the Airwave
logomark and a short article title laid over it (mark on the left, title to the right). Reusable, so we can build
a feature image for any post whenever we want. Matches the site's brand (public/logo.png + shared Inter font +
the dark navy tint), same toolchain as gen-og-image.py (Pillow + numpy).

Run:
  python apps/site/scripts/gen-blog-image.py \
    --screenshot public/screenshots/appletv-guide-featured.webp \
    --title "Airwave vs IPTV" \
    --out public/blog/self-hosted-live-tv-without-re-encoding.png

Then point the post's frontmatter `image:` at the output (e.g. /blog/self-hosted-live-tv-without-re-encoding.png).
Paths are resolved relative to apps/site when not absolute. Needs Pillow + numpy.
"""
from __future__ import annotations

import argparse
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)  # apps/site
FONTS = os.path.join(os.path.dirname(SITE), "tv-roku", "fonts")  # shared brand fonts
LOGO = os.path.join(SITE, "public", "logo.png")

W, H = 1200, 630  # standard featured / social-card size
NAVY = (7, 11, 20)  # brand dark (~#060a14), used for the scrim
ACCENT = (74, 159, 224)  # sky-blue #4a9fe0


def resolve(p: str) -> str:
    return p if os.path.isabs(p) else os.path.join(SITE, p)


def cover(img: Image.Image, w: int, h: int) -> Image.Image:
    """Resize + center-crop so the image fills w x h (like CSS object-fit: cover)."""
    src_ar, dst_ar = img.width / img.height, w / h
    if src_ar > dst_ar:
        nh = h
        nw = round(h * src_ar)
    else:
        nw = w
        nh = round(w / src_ar)
    img = img.resize((nw, nh), Image.LANCZOS)
    return img.crop(((nw - w) // 2, (nh - h) // 2, (nw - w) // 2 + w, (nh - h) // 2 + h))


def backdrop(screenshot_path: str, blur: int, dim: float) -> Image.Image:
    """Blurred screenshot behind a CENTER-weighted navy scrim: darkest in the middle (behind the centered
    lockup) so the text stays readable, fading out toward the edges so the blurred screenshot shows through.
    A bright, colorful frame (e.g. a video-playback capture) reads best; a dark UI barely shows."""
    shot = Image.open(resolve(screenshot_path)).convert("RGB")
    bg = cover(shot, W, H).filter(ImageFilter.GaussianBlur(blur)).convert("RGBA")
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = (W - 1) / 2.0, (H - 1) / 2.0
    # Elliptical distance (wider horizontally to cover the wide lockup): 0 at center -> ~1 at the edges.
    d = np.sqrt(((xx - cx) / (W * 0.52)) ** 2 + ((yy - cy) / (H * 0.46)) ** 2)
    core = np.clip(1.0 - d, 0.0, 1.0) ** 1.4  # 1 at center, 0 at edge
    floor = 0.22  # gentle overall veil so the whole frame still reads as the brand navy
    alpha = np.clip(floor + dim * core, 0.0, 1.0)
    scrim = np.zeros((H, W, 4), dtype=np.uint8)
    scrim[..., :3] = NAVY
    scrim[..., 3] = (alpha * 255).astype(np.uint8)
    return Image.alpha_composite(bg, Image.fromarray(scrim, "RGBA"))


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    lines: list[str] = []
    cur = ""
    for word in text.split():
        trial = (cur + " " + word).strip()
        if not cur or draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def make(screenshot: str, title: str, out: str, subtitle: str | None, blur: int, dim: float) -> None:
    bg = backdrop(screenshot, blur, dim)
    draw = ImageDraw.Draw(bg)

    logo = Image.open(LOGO).convert("RGBA")
    mark_h = 132
    mark_w = round(mark_h * logo.width / logo.height)
    mark = logo.resize((mark_w, mark_h), Image.LANCZOS)

    # Lockup: mark | vertical separator | title, sized to its content and centered as one unit.
    MARGIN = 90  # min side margin (bounds title wrapping)
    GAP1, GAP2 = 38, 38  # mark->separator, separator->text
    SEP_W = 3
    text_max = W - 2 * MARGIN - mark_w - GAP1 - SEP_W - GAP2
    title_font = ImageFont.truetype(os.path.join(FONTS, "Inter-Bold.ttf"), 74)
    lines = wrap(draw, title, title_font, text_max)
    line_h = round(title_font.size * 1.14)
    title_h = line_h * len(lines)

    sub_font = None
    sub_h = 0
    if subtitle:
        sub_font = ImageFont.truetype(os.path.join(FONTS, "Inter-Medium.ttf"), 30)
        sub_h = 14 + round(sub_font.size * 1.2)

    text_block_h = title_h + sub_h
    group_h = max(mark_h, text_block_h)
    text_w = max((draw.textlength(l, font=title_font) for l in lines), default=0.0)
    if sub_font:
        text_w = max(text_w, draw.textlength(subtitle, font=sub_font))
    group_w = mark_w + GAP1 + SEP_W + GAP2 + round(text_w)

    gx = (W - group_w) // 2  # center the whole lockup horizontally
    gy = (H - group_h) // 2

    bg.paste(mark, (gx, gy + (group_h - mark_h) // 2), mark)

    # Vertical separator between the mark and the text.
    sep_x = gx + mark_w + GAP1
    sep_h = round(group_h * 0.76)
    sep_y = gy + (group_h - sep_h) // 2
    draw.rectangle([sep_x, sep_y, sep_x + SEP_W - 1, sep_y + sep_h], fill=(255, 255, 255, 74))

    tx = sep_x + SEP_W + GAP2
    ty = gy + (group_h - text_block_h) // 2
    for i, line in enumerate(lines):
        draw.text((tx, ty + i * line_h), line, font=title_font, fill=(255, 255, 255, 255))
    if sub_font:
        draw.text((tx, ty + title_h + 14), subtitle, font=sub_font, fill=ACCENT + (255,))

    out_path = resolve(out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    bg.convert("RGB").save(out_path, quality=90)
    print(f"  wrote {out_path}  ({W}x{H})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Generate a branded blog featured image.")
    ap.add_argument("--screenshot", required=True, help="Background screenshot (path under apps/site, or absolute).")
    ap.add_argument("--title", required=True, help='Short article title, e.g. "Airwave vs IPTV".')
    ap.add_argument("--out", required=True, help="Output image path (e.g. public/blog/my-post.png).")
    ap.add_argument("--subtitle", default=None, help="Optional accent subtitle under the title.")
    ap.add_argument("--blur", type=int, default=24, help="Gaussian blur radius for the backdrop (default 24).")
    ap.add_argument("--dim", type=float, default=0.62, help="Center scrim darkness 0..1 behind the lockup (default 0.62).")
    args = ap.parse_args()
    make(args.screenshot, args.title, args.out, args.subtitle, args.blur, args.dim)
    print("done")
