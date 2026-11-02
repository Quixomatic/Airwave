/**
 * Color math for the guide's themes. Colors are the CSS strings the tokens use: `#rgb`, `#rrggbb`, `#rrggbbaa`,
 * `rgb(r, g, b)`, `rgba(r, g, b, a)` or `transparent`. No react-native imports, so bun can load it.
 */
export type Rgba = { r: number; g: number; b: number; a: number };

export function parseColor(css: string): Rgba {
  const s = css.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hex) {
    const h = hex[1]!.length === 3 ? hex[1]!.replace(/./g, (c) => c + c) : hex[1]!;
    const byte = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: byte(0), g: byte(2), b: byte(4), a: h.length === 8 ? byte(6) / 255 : 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (fn) return { r: +fn[1]!, g: +fn[2]!, b: +fn[3]!, a: fn[4] === undefined ? 1 : +fn[4] };
  throw new Error(`unparseable color: ${css}`);
}

const toRgba = (c: string | Rgba): Rgba => (typeof c === "string" ? parseColor(c) : c);

/** `top` painted over `under` (standard source-over). Neither is rounded, so chains of composites stay exact. */
export function over(top: string | Rgba, under: string | Rgba): Rgba {
  const f = toRgba(top);
  const u = toRgba(under);
  const a = f.a + u.a * (1 - f.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const ch = (x: number, y: number) => (x * f.a + y * u.a * (1 - f.a)) / a;
  return { r: ch(f.r, u.r), g: ch(f.g, u.g), b: ch(f.b, u.b), a };
}

/** `#rrggbb` for an opaque color (channels rounded to the nearest integer). */
export function toHex({ r, g, b }: Rgba): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** `a` moved toward `b` by `t` (0 = a, 1 = b), as `#rrggbb`. Both colors must be opaque. */
export function mixColors(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  const m = (p: number, q: number) => p + (q - p) * t;
  return toHex({ r: m(x.r, y.r), g: m(x.g, y.g), b: m(x.b, y.b), a: 1 });
}

/** WCAG 2.x relative luminance, 0 (black) to 1 (white). */
export function luminance({ r, g, b }: Rgba): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * WCAG 2.x contrast ratio, 1 to 21, of `fg` on `bg`. A translucent `fg` is composited over `bg` first, so `bg` must be
 * opaque: composite a translucent surface over what lies under it before asking.
 */
export function contrastRatio(fg: string | Rgba, bg: string | Rgba): number {
  const under = toRgba(bg);
  if (under.a !== 1) throw new Error("contrastRatio needs an opaque background");
  const l1 = luminance(over(fg, under));
  const l2 = luminance(under);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** `rgba(r, g, b, a)` for a color, with the channels rounded and the alpha to three places. */
export function rgbaCss({ r, g, b, a }: Rgba): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(a * 1000) / 1000})`;
}

/** `top` laid over `under` as one CSS color (`under` may itself be translucent). */
export const compositeCss = (top: string, under: string): string => rgbaCss(over(top, under));

/** Black or white, whichever reads better on `fill` (a CSS color, laid over the opaque `under` first). */
export function autoInk(fill: string, under: string): "#000000" | "#ffffff" {
  const bg = toHex(over(fill, under));
  return contrastRatio("#000000", bg) >= contrastRatio("#ffffff", bg) ? "#000000" : "#ffffff";
}

/**
 * A color (any of the forms above) at alpha `a`, as `rgba()`. A color that has an alpha of its own (`#rrggbbaa`, `rgba()`) keeps it, scaled
 * by `a`: a 50% color asked for at 50% is 25%. A color this cannot read is returned as it is, so a bad token shows as the CSS it is
 * (and is caught by the token checks) rather than as `rgba(NaN, ...)`.
 */
export function hexA(color: string, a: number): string {
  let c: Rgba;
  try {
    c = parseColor(color);
  } catch {
    return color;
  }
  const alpha = c.a === 1 ? a : Math.round(a * c.a * 1000) / 1000;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha})`;
}
