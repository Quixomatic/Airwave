import * as LucideIcons from "lucide-react-native";
import type { ComponentType } from "react";
import { Dimensions, Platform } from "react-native";
import type { TextStyle } from "react-native";

import type { GuideGridProgram } from "@/lib/api";

/**
 * The Aurora grid's layout constants + helpers, ported verbatim from tv-web's `aurora-grid.tsx`.
 * The design is authored at 2560px wide and used as a PROPORTION guide: `vw(px)` converts a spec
 * pixel to actual dp for the current screen width, so the whole layout scales fluidly — identical
 * math to tv-web, just returning a number (RN sizes are numbers) instead of a `vw` CSS string.
 */
export const DESIGN_W = 2560;

/**
 * A global scale-up knob. tv-web's `vw` sizes everything off WIDTH assuming a 16:9 TV; the iPad is
 * taller than 16:9 (~3:2 / 4:3), so pure width-scaling leaves the UI small with slack vertical space
 * (and the content-sized featured panel under-fills). `UI_SCALE` multiplies the whole layout —
 * fonts, row/rail/featured sizing — so it fills the taller screen.
 *
 * This is an iPad/tablet-only compensation: a TV IS 16:9 (the design's native aspect), so it needs
 * no bump — 1.3 there would oversize everything. TVs (tvOS / Android TV / Fire TV) run at 1.0,
 * matching tv-web's proven sizing on the C2. Dial the iPad value to taste.
 */
export const UI_SCALE = Platform.isTV ? 1 : 1.3;

/** spec px (at 2560 wide) → dp at the given screen width, scaled up for the device's taller aspect. */
export const vwOf = (width: number, px: number) => (px / DESIGN_W) * width * UI_SCALE;

/**
 * Fixed-dp CHROME scale (sidebar widths, glass-circle sizes, border radii). The guide grid scales with
 * screen width via `vwOf`, but the chrome was authored in raw dp that looks right on the wide iPad
 * (1366dp) + Apple TV (~1920dp) screens. **Android TV normalizes every panel — 1080p or 4K — to a 960dp
 * layout space** (confirmed on the Google TV Streamer + both emulators: `w=960` regardless of `scale`),
 * i.e. ~HALF the tvOS dp width for the same content, so raw chrome renders ~2× oversized against the
 * `vwOf`-scaled guide (huge collapsed sidebar, over-rounded cards). `cs()` scales it back in proportion to
 * width — but ONLY on Android TV. iPad + Apple TV (`Platform.OS === "ios"`) and Android tablets (`isTV`
 * false, which use `UI_SCALE` 1.3 like the iPad) stay at exactly 1, so their proven look is untouched.
 */
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const CHROME_SCALE =
  Platform.OS === "android" && Platform.isTV ? clamp(Dimensions.get("window").width / 1920, 0.5, 1) : 1;
/** Scale a raw-dp chrome value. Identity everywhere except Android TV (≈0.5 at 960dp). */
export const cs = (px: number) => px * CHROME_SCALE;

/**
 * Style-object chrome scaler — the ergonomic form of `cs()` for whole screens authored in raw dp (watch
 * chrome, diagnostic, settings). Multiplies the size-like keys by `CHROME_SCALE` so they match the
 * `vwOf`-scaled guide on Android TV. **Returns the SAME object untouched when `CHROME_SCALE === 1`**
 * (iPad / Apple TV / Android tablets) — no copy, no change, provably identical there. On Android TV it
 * shallow-copies and scales only the allow-listed numeric keys; it deliberately SKIPS `borderWidth`
 * (hairlines), `opacity`/`flex*`/`zIndex`/`elevation`/`aspectRatio`, and any non-number (e.g. "100%"
 * strings, percent offsets). NOTE: only pass style blocks whose sizes are raw literals — a block that
 * mixes in an already-screen-derived value (e.g. a `vw()`/dimension-based width) must be scaled per-key
 * with `cs()` instead, or that value gets double-scaled.
 */
const SCALE_KEYS = new Set<string>([
  "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight",
  "top", "bottom", "left", "right",
  "margin", "marginTop", "marginBottom", "marginLeft", "marginRight", "marginHorizontal", "marginVertical",
  "padding", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "paddingHorizontal", "paddingVertical",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
  "fontSize", "lineHeight", "gap", "rowGap", "columnGap",
]);
export function scaled<T extends TextStyle>(style: T): T {
  if (CHROME_SCALE === 1) return style;
  const out = { ...style } as Record<string, unknown>;
  for (const k in out) {
    if (SCALE_KEYS.has(k) && typeof out[k] === "number") out[k] = (out[k] as number) * CHROME_SCALE;
  }
  return out as T;
}

export const ACCENTS = ["#2f9e8f", "#4a9fe0", "#3b82f6", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e", "#7c8aa3"];

export const CH_FRAC = 212 / DESIGN_W; // channel rail = this fraction of the guide column width
export const ROW_FRAC = 168 / DESIGN_W; // row height fraction (of screen width)
export const FEATURE_SCALE = 0.76; // featured panel uniformly shrunk so the grid keeps room
export const WINDOW_MIN = 180; // minutes of timeline across the lane
export const LEAD_MIN = 30; // minutes of "already aired" shown before the grid start
export const MIN = 60_000;
export const MIN_VISIBLE_PX = 24; // cull program blocks narrower than this
export const PROGRESS_FILL_ELAPSED_STRONGER = true;

export const SIDEBAR_SLIVER_W = 92;
export const SIDEBAR_EXPANDED_W = 300;

export const accentOf = (i: number) => ACCENTS[i % ACCENTS.length]!;

/** hex (#rrggbb) + alpha → rgba(). */
export function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });

export function subLine(g: GuideGridProgram["guide"]): string {
  const parts: string[] = [];
  if (g.season != null && g.episode != null) parts.push(`S${g.season}, E${g.episode}`);
  if (g.contentRating) parts.push(g.contentRating);
  if (g.durationMs) parts.push(`${Math.round(g.durationMs / 60000)}m`);
  return parts.join(" · ");
}

export const audioBadge = (ch?: number) =>
  ch === 8 ? "7.1" : ch === 6 ? "5.1" : ch === 2 ? "Stereo" : ch ? "Mono" : null;

/** Index of the program airing at `nowMs` (else 0) — the "on now" slot. */
export function liveProgramIndex(programs: GuideGridProgram[], nowMs: number): number {
  const i = programs.findIndex((p) => {
    const s = new Date(p.startsAt).getTime();
    return nowMs >= s && nowMs < s + p.durationSeconds * 1000;
  });
  return i >= 0 ? i : 0;
}

type IconCmp = ComponentType<{ size?: number; color?: string; fill?: string }>;
const LUCIDE = LucideIcons as unknown as Record<string, IconCmp>;

/** Resolve a channel's stored icon id (`lucide:Radio`) to its lucide component. */
export function channelIcon(id?: string | null): IconCmp {
  if (id && id.startsWith("lucide:")) return LUCIDE[id.slice(7)] ?? LucideIcons.Radio;
  return LucideIcons.Radio;
}
export function pkgIconCmp(id?: string | null): IconCmp {
  if (id && id.startsWith("lucide:")) return LUCIDE[id.slice(7)] ?? LucideIcons.Folder;
  return LucideIcons.Folder;
}
