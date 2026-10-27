import { C } from "@/lib/theme";

/**
 * The guide's look as data: every color, accent alpha, stroke width, corner radius and font weight
 * the guide screen draws with, defined in one place instead of as literals in each component.
 *
 * - Colors are CSS strings: `#rrggbb`, `rgba(r,g,b,a)` or `transparent`.
 * - Alphas are applied to a row's accent with `hexA(accent, alpha)`.
 * - Widths and radii are design px. The comment on each names the scaler the rows pass it through
 *   (`line()` snaps to a physical pixel, `cs()` is the Android TV chrome scale), so `1` or `8`
 *   renders exactly as the literal did.
 * - Layout (row, rail and lane sizes, font sizes, padding) is not a token.
 *
 * No react-native imports, so bun can load this file in tests.
 */
export type GuideFontWeight = "400" | "500" | "600" | "700" | "800";

export type GuideTokens = {
  // Surfaces
  /** Guide background. */
  bg: string;
  /** Dimmer over the guide while the sidebar is expanded. */
  scrim: string;
  /** "Now" marker above the time header. */
  now: string;
  /** 1dp rule above each channel row. */
  rowBorder: string;

  // Program cells
  /** Fill of a cell that is not on now. */
  cellBg: string;
  /** Fill of the on-now cell, under its progress tint. */
  liveCellBg: string;
  cellBorder: string;
  /** line() */
  cellBorderW: number;
  /** Selected cell outline, and the border of the rail circle when the rail is focused. */
  ring: string;
  /** line() */
  ringW: number;
  /** cs() */
  cellRadius: number;
  /** Accent alphas of the on-now cell's tint: `elapsed` left of the now line, `remain` right of it. */
  liveFill: { elapsed: number; remain: number };
  /** Accent bar on the on-now cell; both line(). */
  liveBar: { w: number; r: number };
  title: string;
  titleWeight: GuideFontWeight;
  sub: string;

  // Channel rail
  /** Accent alpha of the focused rail's background. */
  railFocusAlpha: number;
  /** Accent alphas of the channel circle's fill and border (also the featured panel's tile). */
  circle: { fillA: number; borderA: number };
  /** Heart outline in the focused rail circle when the channel is not a favorite. */
  heartOff: string;
  /** Favorite heart: the filled badge and the focused circle. */
  fav: string;
  number: string;
  numberFocused: string;
  numberWeight: GuideFontWeight;
  name: string;

  // Time header
  headerDay: string;
  headerTick: string;

  // Featured panel
  featured: {
    tagline: string;
    rule: string;
    title: string;
    episode: string;
    /** Year, rating, critic score and time range. */
    meta: string;
    /** The "·" between meta items. */
    sep: string;
    star: string;
    summary: string;
    status: string;
    /** Progress track; the fill is the accent. */
    track: string;
    /** Accent alpha of the channel number. */
    numberA: number;
  };
  /** Resolution, HDR and audio badges: a left-to-right gradient and its text color. */
  badge: Record<"res" | "hdr" | "audio", { grad: readonly [string, string]; text: string }>;

  // Sidebar
  sidebar: { bg: string; border: string; rule: string; icon: string; shadow: string };
  /** The sidebar's glass circle buttons. `*A` values are accent alphas. */
  glass: {
    ringA: number;
    litBorderA: number;
    litFillA: number;
    idleBorder: string;
    idleFill: string;
    labelLit: string;
    label: string;
    sublabel: string;
  };

  // Empty state
  ghost: { block: string; title: string; sub: string };
};

/** The standard Airwave guide. Values are the literals the rows used before they read tokens. */
export const AURORA: GuideTokens = {
  bg: C.bg,
  scrim: "rgba(6,10,20,0.55)",
  now: C.now,
  rowBorder: C.rowBorder,

  cellBg: "rgba(148,163,184,0.05)",
  liveCellBg: "transparent",
  cellBorder: C.cellBorder,
  cellBorderW: 1,
  ring: C.ring,
  ringW: 2,
  cellRadius: 8,
  liveFill: { elapsed: 0.32, remain: 0.1 },
  liveBar: { w: 3, r: 4 },
  title: "#f1f5f9",
  titleWeight: "600",
  sub: C.mutedFg,

  railFocusAlpha: 0.12,
  circle: { fillA: 0.2, borderA: 0.35 },
  heartOff: "#c3c9d4",
  fav: C.fav,
  number: C.mutedFg,
  numberFocused: "#e6eaf1",
  numberWeight: "700",
  name: C.mutedFg,

  headerDay: "#e6eaf1",
  headerTick: "#c3c9d4",

  featured: {
    tagline: "#64748b",
    rule: C.border,
    title: "#f1f5f9",
    episode: "#c3c9d4",
    meta: "#c3c9d4",
    sep: "#475569",
    star: C.star,
    summary: "#c9cfda",
    status: "#e6eaf1",
    track: "rgba(148,163,184,0.18)",
    numberA: 0.75,
  },
  badge: {
    res: { grad: ["#7fd6de", "#4bb8c9"], text: "#06222a" },
    hdr: { grad: ["#f0c14b", "#e0a020"], text: "#2a1e00" },
    audio: { grad: ["#1e293b", "#334155"], text: "#dfe4ec" },
  },

  sidebar: { bg: C.sidebarBg, border: C.border, rule: "rgba(255,255,255,0.08)", icon: "#f1f5f9", shadow: "#000" },
  glass: {
    ringA: 0.7,
    litBorderA: 0.4,
    litFillA: 0.28,
    idleBorder: "rgba(255,255,255,0.12)",
    idleFill: "rgba(18,24,38,0.55)",
    labelLit: "#f8fafc",
    label: "#c3c9d4",
    sublabel: "#64748b",
  },

  ghost: { block: "rgba(148,163,184,0.09)", title: "#e2e8f0", sub: "#94a3b8" },
};

/**
 * The tokens the guide draws with. Always Aurora for now; components call this rather than importing
 * `AURORA`, so a different source can be swapped in here without touching them.
 */
export function useGuideTokens(): GuideTokens {
  return AURORA;
}
