import { C } from "@/lib/theme";

import { mixColors, over, toHex } from "./color";

/**
 * The guide's look as data: every color, accent alpha, stroke width, corner radius, typeface and texture the guide
 * screen draws with, defined in one place instead of as literals in each component.
 *
 * - Colors are CSS strings: `#rrggbb`, `rgba(r,g,b,a)` or `transparent`.
 * - Alphas are applied to a row's accent with `hexA(accent, alpha)`.
 * - Sizes are design px. The comment on each field names the scaler the rows pass it through:
 *     `line()` snaps to a physical pixel, `cs()` is the Android TV chrome scale: the fields the guide had before themes
 *       (so `1` or `8` renders exactly as the literal did);
 *     `vw()` is the number you would pass to `vw()`, i.e. px on the 2560-wide reference screen: every field themes added.
 *   At 1080p on Android TV one `line()` px is 4/3 `vw()` px. Theme data is authored in `vw()` and converted to
 *   `line()` / `cs()` for the old fields (see guide-themes.ts), so a theme reads the same either way.
 * - Layout (row, rail and lane sizes, padding) is not a token. A theme changes how the guide is painted, never where anything
 *   sits; the size-like exceptions are `fontScale` and a text role's `scale` (text only), and `railLayout`, which rearranges the
 *   inside of the rail without moving its box.
 * - Every field has an "off" value in `AURORA` that draws what the guide drew before themes existed, so a theme that does not
 *   mention a field gets that look. Where Aurora has no value for a field (a pattern, a shadow, a status label) the off value
 *   is `null` or `"none"`.
 *
 * `AURORA` is the standard look. A theme (guide-themes.ts) is a patch over it, and the rows read the resolved set through
 * `useGuideTokens()`. Keep a token set plain data: the native guide view takes the same object as JSON (its `tokens` prop,
 * see native-rows-geo.ts `rowTokens`).
 *
 * No react-native imports, so bun can load this file in tests.
 */
export type GuideFontWeight = "400" | "500" | "600" | "700" | "800" | "900";

/** The on-now cell's progress tint: `elapsed` fills left of the now line, `remain` right of it. */
export type GuideLiveFill =
  /** The row's accent at these alphas. */
  | { mode: "tint"; elapsed: number; remain: number }
  /** CSS colors, the same on every row, so "on now" does not depend on hue. */
  | { mode: "neutral"; elapsed: string; remain: string };

// ---------------------------------------------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------------------------------------------

/** The text roles a theme styles. `header` is the time ticks, `day` the date label beside them, `featured` the featured panel. */
export type GuideTextRole = "title" | "sub" | "number" | "name" | "header" | "day" | "featured";

export type GuideTextStyle = {
  /** Which of the theme's two faces draws the role: its `text` family or its `display` family (each the system font when null). */
  font: "text" | "display";
  weight: GuideFontWeight;
  /** `upper` sets the role in capitals (the string is upper-cased where it is drawn). */
  case: "none" | "upper";
  /** Letter spacing in em: Paint.setLetterSpacing(em) natively, `letterSpacing = em * fontSize` in React Native. */
  track: number;
  /** Multiplier on the role's Aurora font size, on top of `fontScale`. */
  scale: number;
  italic: boolean;
};

/**
 * A family and a size multiplier per text role. `display` and `text` name a bundled family (the OFL fonts under
 * assets/fonts, registered in app.json by expo-font); null is the system font, which is what Aurora uses. Weights are the CSS
 * numbers a React Native `fontWeight` takes, and a family is registered with the weights its theme uses.
 */
export type GuideTypeStyle = { display: { family: string } | null; text: { family: string } | null } & Record<GuideTextRole, GuideTextStyle>;

// ---------------------------------------------------------------------------------------------------------------
// Rail, circle and accent
// ---------------------------------------------------------------------------------------------------------------

/**
 * Where a row's accent comes from. `channel`: the channel's own tint (Aurora). `fixed`: `accentFixed` on every row. `cycle`: the
 * theme's own `accentCycle` colors by row index. See `rowAccent`.
 */
export type GuideAccentMode = "channel" | "fixed" | "cycle";

/** Solid colors for the rail of a focused row, replacing Aurora's accent wash (an inverted rail). */
export type GuideRailFocus = {
  bg: string;
  number: string;
  name: string;
  /** Fill of the channel circle and of the circle behind the rail-focus heart, or null to keep `circleStyle.fill`. */
  circle: string | null;
  /** Glyph color on that circle, or null to keep `circleStyle.glyph`. */
  glyph: string | null;
};

/** The focused rail's edge bar. `w` 0 draws none. */
export type GuideRailBar = {
  /** vw() */
  w: number;
  /** vw(): corner radius. */
  r: number;
  /** A fixed color in place of the row's accent mark, or null. */
  color: string | null;
};

/** A one-color rule: a vertical one on the rail's right edge, a column rule on a cell's left edge. */
export type GuideRule = { w: number; color: string };

/** The channel circle. */
export type GuideCircleStyle = {
  /** Corner radius as a fraction of the diameter: 0.5 is a circle, 0 a square. */
  radius: number;
  /** Multiplier on the circle's diameter (the rail's box does not change). */
  scale: number;
  /** `accent`: the row's accent at `circle.fillA`. `accent-solid`: the row's accent. `none`: no fill. Otherwise a color. */
  fill: "accent" | "accent-solid" | "none" | string;
  /** `accent`: the accent mark at `circle.borderA`. Otherwise a color. */
  border: "accent" | string;
  /** vw(), or null for Aurora's `line(1)` hairline. */
  borderW: number | null;
  /** `accent`: the accent mark. `auto`: black or white, whichever reads better on the fill. Otherwise a color. */
  glyph: "accent" | "auto" | string;
  /** Draftsman's centre marks (four short ticks through the circle's centre lines), or null. All vw(). */
  marks: { len: number; gap: number; w: number } | null;
};

// ---------------------------------------------------------------------------------------------------------------
// Program cells
// ---------------------------------------------------------------------------------------------------------------

/** Text colors inside the selected cell when its fill changes (`cellFocusBg`). `kicker` is the status line above the title. */
export type GuideFocusText = { title: string; sub: string; kicker: string };

/** Text colors inside an on-now cell whose live fill is a solid block or a color too bright or dark for the normal ones. */
export type GuideLiveText = { title: string; sub: string };

/** One offset shape under a cell: a copy of its box moved by (`dx`, `dy`), grown by `grow` on every side, in `color` at alpha `a`. */
export type GuideShadowStep = {
  dx: number;
  dy: number;
  grow: number;
  color: string;
  a: number;
  /** An outline on the shape, drawn after its fill. */
  stroke?: { color: string; w: number };
};

/**
 * A stack of hard (never blurred) shadow shapes under a cell, drawn in order. `inside` shrinks the visible body by the offset so
 * the cell's box, and so the geometry and cull, never change: a hard shadow that sits inside the box. All vw().
 */
export type GuideShadow = { inside: boolean; steps: readonly GuideShadowStep[] };

/** One ring of the selected cell's soft glow: a stroke `w` wide just outside the border box, in `color` (`accent`: the row's accent mark) at alpha `a`. */
export type GuideHaloRing = { w: number; a: number; color: "accent" | string };

/** A mark every tick of a dimension line or ruler: minor ones every `every` minutes, taller major ones every `majorEvery`. */
export type GuideTicks = { every: number; majorEvery: number; minorH: number; majorH: number; w: number; color: string };

/** The on-now cell's progress, and the featured panel's bar. All vw(). */
export type GuideProgress = {
  /** `none`: no bar on the cell (the featured panel keeps its stock bar). `bar`: a rounded bar. `band`: a full-bleed band. `ticks`: a dimension line. */
  style: "none" | "bar" | "band" | "ticks";
  h: number;
  r: number;
  /** Gap to the cell's left and right edges. */
  inset: number;
  /** Gap to the cell's bottom edge. */
  bottom: number;
  track: string;
  /** `accent`: the row's accent mark. Otherwise a color. */
  fill: "accent" | string;
  trackBorder: { color: string; w: number; sides?: "top" } | null;
  /** A halftone laid over the part of the track the programme has yet to cover. */
  remainPattern: GuideHalftone | null;
  /** For style `ticks`: the dimension line's ticks (`capH` is the height of the end caps). */
  ticks: (GuideTicks & { capH: number }) | null;
};

/** A word that says a cell is live without color. `minCell` drops it on cells narrower than that many vw() px. */
export type GuideStatusLabel =
  | { mode: "none" }
  /** A tag in the sub-line. */
  | { mode: "plate"; text: string; bg: string; fg: string; minCell: number }
  /** A star-shaped burst. `size` is vw(). */
  | { mode: "burst"; text: string; bg: string; fg: string; outline: string; size: number; minCell: number }
  /** A caps line above the title: `live` ("ON NOW") on the live cell, the start time on the others. A cell too narrow to hold the line whole drops it. */
  | { mode: "kicker"; live: string; color: string };

/** Where program art goes: under a scrim across the whole cell, or in a framed strip beside the text. */
export type GuideArtLayout = {
  layout: "full" | "side";
  /** For `side`: the strip's share of the cell's width. */
  sideFrac: number;
  /** vw(): the strip's frame, drawn on its text-side edge. */
  frameW: number;
  frameColor: string;
  /** Behind a cell whose art has not loaded. */
  placeholder: GuideGradient;
};

/** `angle` in degrees (CSS: 135 runs from the top left to the bottom right); each stop is a color at 0..1 along the line. */
export type GuideGradient = { angle: number; stops: readonly (readonly [color: string, at: number])[] };

// ---------------------------------------------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------------------------------------------

/** Dots on a 45 degree lattice. `pitch`, `dot` are vw(); `angle` is the lattice's rotation in degrees. */
export type GuideHalftone = { kind: "halftone"; pitch: number; dot: number; angle: number; color: string };

/** Graph paper: a line every `minor` and a heavier one every `major` (vw()), `w` thick. */
export type GuideGrid = { kind: "grid"; minor: number; major: number; minorColor: string; majorColor: string; w: number };

/** Paper grain: a `tile` px square of `texel` px specks, `density` of them lit, in `colors` at alpha `alpha`, from `seed`. */
export type GuideGrain = { kind: "grain"; tile: number; texel: number; density: number; alpha: number; colors: readonly string[]; seed: number };

/**
 * Repeating textures. `bg` sits behind the plates, never behind text; `overlay` (grain) is painted last, over everything, at
 * low alpha. A variant that changes a tile's colors needs its own tile.
 */
export type GuidePatterns = { bg: GuideHalftone | GuideGrid | null; overlay: GuideGrain | null };

/**
 * Two-ink misregistration: the listed text roles and shapes are drawn twice, the back copy in `color`, offset by (`dx`, `dy`) vw()
 * px, blended with MULTIPLY. Chips that carry ink-B text on an ink-A fill use the pre-computed overprint color instead.
 * `blend` is "multiply" in every theme; "plain" is only ever made at run time, for a thumbnail (the Settings preview), which draws the
 * two inks without blending them (see `plainInk`).
 */
export type GuideMisregister = {
  dx: number;
  dy: number;
  color: string;
  blend: "multiply" | "plain";
  text: readonly ("number" | "title" | "featured" | "header")[];
  shapes: readonly ("circle" | "ring")[];
};

// ---------------------------------------------------------------------------------------------------------------
// Time header and featured panel (drawn by React Native in every renderer)
// ---------------------------------------------------------------------------------------------------------------

/** The time header: an optional plate, a rule under it, an optional ruler of 5 minute ticks and the shape of the now marker. */
export type GuideHeaderStyle = {
  bg: string | null;
  rule: { w: number; color: string } | null;
  ruler: GuideTicks | null;
  markerShape: "triangle" | "square";
};

/** A bordered plate (with an optional hard shadow) behind the featured panel's text. All vw(). */
export type GuideFeaturedPlate = {
  bg: string;
  border: { w: number; color: string };
  radius: number;
  shadow: { dx: number; dy: number; color: string } | null;
};

// ---------------------------------------------------------------------------------------------------------------
// The token set
// ---------------------------------------------------------------------------------------------------------------

export type GuideTokens = {
  // Surfaces
  /** Guide background. */
  bg: string;
  /** Dimmer over the guide while the sidebar is expanded. */
  scrim: string;
  /** "Now" marker above the time header. */
  now: string;
  /** The rule above each channel row. */
  rowBorder: string;
  /** Thickness of that rule: vw(), or null for the stock 1dp hairline. */
  rowBorderW: number | null;

  // Program cells
  /** Fill of a cell that is not on now. */
  cellBg: string;
  /** Fill of the on-now cell, under its progress tint. */
  liveCellBg: string;
  cellBorder: string;
  /** line() */
  cellBorderW: number;
  /**
   * Dashes of the outline of a cell that is neither live nor selected (`[on, off]`, vw()), or null for a solid one. The React Native
   * rows draw `borderStyle: "dashed"`, whose dashes follow the outline's width, so a non-null value means dashed there and the exact
   * lengths are the native painter's.
   */
  cellBorderDash: readonly [number, number] | null;
  /** Selected cell outline, and the border of the rail circle when the rail is focused. */
  ring: string;
  /** line() */
  ringW: number;
  /** A second outline just outside the selected cell's ring (a double ring), or null. */
  ringOuter: {
    color: string;
    /** line() */
    w: number;
    /** vw(): the gap between the two rings. */
    gap: number;
    /** `[on, off]` in vw(), or null for a solid ring (the React Native rows draw any dash as `borderStyle: "dashed"`; see `cellBorderDash`). */
    dash: readonly [number, number] | null;
  } | null;
  /** cs() */
  cellRadius: number;
  /** Fill of the selected cell (a lifted, inverted or tinted focus), or null to keep the cell's own. */
  cellFocusBg: string | null;
  focusText: GuideFocusText | null;
  liveFill: GuideLiveFill;
  liveText: GuideLiveText | null;
  /** The on-now bar, in the row's accent mark (see `accentFg`) unless it has a `color`. */
  liveBar: {
    /** line() */
    w: number;
    /** line() */
    r: number;
    /** vw(): from the cell's padding edge. */
    x: number;
    /** vw(): the gap above and below it; with `x` 0 and `inset` 0 the bar is a full-height spine. */
    inset: number;
    color: string | null;
  };
  /** Left edge rule of a cell (a column rule for cells without boxes), or null. `inset` is the gap above and below it, vw(). */
  cellRule: { w: number; color: string; inset: number } | null;
  /** Offset shapes under a resting cell, and under the selected one (the only large offset in the themes that use them), or null. */
  shadow: GuideShadow | null;
  shadowFocus: GuideShadow | null;
  /** A one-line highlight along a cell's top edge, or null. vw(). */
  highlight: { color: string; w: number } | null;
  /** The selected cell's glow as stacked rings at falling alpha, or null. */
  halo: readonly GuideHaloRing[] | null;
  progress: GuideProgress;
  statusLabel: GuideStatusLabel;
  title: string;
  titleWeight: GuideFontWeight;
  sub: string;

  // Channel rail
  /** Solid rail background, so rail text sits on a plate. `transparent` for none. */
  railBg: string;
  /** Accent alpha of the focused rail's background. */
  railFocusAlpha: number;
  railFocus: GuideRailFocus | null;
  railBar: GuideRailBar;
  /** Vertical rule on the rail's right edge, or null. */
  railDivider: GuideRule | null;
  /** `numeral`: an oversized number top left, the circle shrunk to the top right, the name below. The rail's box is unchanged. */
  railLayout: "aurora" | "numeral";
  /** Alphas of the channel circle's fill (the accent) and border (the accent mark); also the featured panel's tile. */
  circle: { fillA: number; borderA: number };
  circleStyle: GuideCircleStyle;
  /** Stroke width of the channel glyph in the 24 unit lucide box (lucide's own is 2). */
  glyphStroke: number;
  /** Heart outline in the focused rail circle when the channel is not a favorite. */
  heartOff: string;
  /** Favorite heart: the filled badge and the focused circle. */
  fav: string;
  /** An outline on the favorite heart badge, so it survives on any rail color. vw(). */
  favStroke: { color: string; w: number } | null;
  number: string;
  numberFocused: string;
  numberWeight: GuideFontWeight;
  name: string;

  // Row accent
  /** Where a row's accent comes from. */
  accentMode: GuideAccentMode;
  /** The colors `cycle` mode hands out by row index. */
  accentCycle: readonly string[] | null;
  /**
   * 0..1: how far the row accent moves toward `title` wherever it is drawn as a mark rather than a tint (the
   * channel glyph, the live and rail bars, the circle's border, the featured panel's name and progress), so a
   * light guide keeps those readable. 0 leaves the accent as it is.
   */
  accentShade: number;
  /** A fixed `#rrggbb` for those marks in place of the accent, or null to use the (shaded) accent. In `fixed` mode this is the accent. */
  accentFixed: string | null;
  /** Plate behind a channel logo image, so a white or light logo stays visible. `transparent` for none. */
  logoPlate: string;

  // Typography
  /** Multiplier on the font size of the rows' text and the time header. Layout does not change; text just grows. */
  fontScale: number;
  typeStyle: GuideTypeStyle;

  // Program art (when the cells show artwork)
  art: GuideArtLayout;
  /** Scrim over the art, left to right: the alpha fades between these two colors. */
  artScrim: readonly [string, string];
  /** Program title and sub-line over the art. */
  artTitle: string;
  artSub: string;

  // Textures
  patterns: GuidePatterns;
  misregister: GuideMisregister | null;

  // Time header
  headerDay: string;
  headerTick: string;
  headerStyle: GuideHeaderStyle | null;

  // Featured panel
  /** Color of the featured panel's channel number and name: `accent` (the row's accent mark) or a color. */
  featuredName: "accent" | string;
  featuredPlate: GuideFeaturedPlate | null;
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
    /** Progress track; the fill is the accent mark. */
    track: string;
    /** Alpha of the channel number, drawn in the accent mark. */
    numberA: number;
  };
  /** Resolution, HDR and audio badges: a left-to-right gradient and its text color. */
  badge: Record<"res" | "hdr" | "audio", { grad: readonly [string, string]; text: string }>;

  // Sidebar
  sidebar: { bg: string; border: string; rule: string; icon: string; shadow: string };
  /** The sidebar's glass circle buttons. `*A` values are alphas of the accent: the ring and lit border draw the accent mark, the lit fill the raw accent. */
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

/** A text role as Aurora draws it: the system font, no case change, no tracking, at the size the rows have always used. */
const aurora = (weight: GuideFontWeight): GuideTextStyle => ({ font: "text", weight, case: "none", track: 0, scale: 1, italic: false });

/** The standard Airwave guide. Values are the literals the rows used before they read tokens. */
export const AURORA: GuideTokens = {
  bg: C.bg,
  scrim: "rgba(6,10,20,0.55)",
  now: C.now,
  rowBorder: C.rowBorder,
  rowBorderW: null,

  cellBg: "rgba(148,163,184,0.05)",
  liveCellBg: "transparent",
  cellBorder: C.cellBorder,
  cellBorderW: 1,
  cellBorderDash: null,
  ring: C.ring,
  ringW: 2,
  ringOuter: null,
  cellRadius: 8,
  cellFocusBg: null,
  focusText: null,
  liveFill: { mode: "tint", elapsed: 0.32, remain: 0.1 },
  liveText: null,
  liveBar: { w: 3, r: 4, x: 3, inset: 10, color: null },
  cellRule: null,
  shadow: null,
  shadowFocus: null,
  highlight: null,
  halo: null,
  progress: {
    style: "none",
    h: 8,
    r: 4,
    inset: 20,
    bottom: 16,
    track: "rgba(148,163,184,0.18)",
    fill: "accent",
    trackBorder: null,
    remainPattern: null,
    ticks: null,
  },
  statusLabel: { mode: "none" },
  title: "#f1f5f9",
  titleWeight: "600",
  sub: C.mutedFg,

  railBg: "transparent",
  railFocusAlpha: 0.12,
  railFocus: null,
  railBar: { w: 4, r: 0, color: null },
  railDivider: null,
  railLayout: "aurora",
  circle: { fillA: 0.2, borderA: 0.35 },
  circleStyle: { radius: 0.5, scale: 1, fill: "accent", border: "accent", borderW: null, glyph: "accent", marks: null },
  glyphStroke: 2,
  heartOff: "#c3c9d4",
  fav: C.fav,
  favStroke: null,
  number: C.mutedFg,
  numberFocused: "#e6eaf1",
  numberWeight: "700",
  name: C.mutedFg,

  accentMode: "channel",
  accentCycle: null,
  accentShade: 0,
  accentFixed: null,
  logoPlate: "transparent",

  fontScale: 1,
  typeStyle: {
    display: null,
    text: null,
    title: aurora("600"),
    sub: aurora("400"),
    number: aurora("700"),
    name: aurora("400"),
    header: aurora("600"),
    day: aurora("600"),
    featured: aurora("700"),
  },

  art: {
    layout: "full",
    sideFrac: 0.38,
    frameW: 0,
    frameColor: "transparent",
    placeholder: {
      angle: 135,
      stops: [
        ["#f59e0b", 0],
        ["#db2777", 0.5],
        ["#4338ca", 1],
      ],
    },
  },
  artScrim: ["rgba(6,10,20,0.88)", "rgba(6,10,20,0.8)"],
  artTitle: "#f1f5f9",
  artSub: "#e6ebf2",

  patterns: { bg: null, overlay: null },
  misregister: null,

  headerDay: "#e6eaf1",
  headerTick: "#c3c9d4",
  headerStyle: null,

  featuredName: "accent",
  featuredPlate: null,
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
 * The color a row's accent is drawn in where it is a mark rather than a tint: the channel glyph, the live bar and the
 * focused rail's bar, the circle's border, the featured panel's channel name and progress. Tints (the circle's fill,
 * the rail's focus wash, the live fill) stay the raw accent at their alphas. For a theme with no shade and no fixed
 * color this is the accent itself.
 */
export function accentFg(tk: Pick<GuideTokens, "accentFixed" | "accentShade" | "title">, accent: string): string {
  if (tk.accentFixed) return tk.accentFixed;
  return tk.accentShade > 0 ? mixColors(accent, tk.title, tk.accentShade) : accent;
}

/**
 * The accent of the row at `index` in the lineup: `channelAccent` (the channel's own tint, or the fallback for its position)
 * in `channel` mode, `accentFixed` in `fixed` mode, and the theme's own colors handed out round and round in `cycle` mode.
 * A mode whose colors are missing falls back to the channel's accent, so a bad token set can never leave a row uncolored.
 */
export function rowAccent(tk: Pick<GuideTokens, "accentMode" | "accentFixed" | "accentCycle">, channelAccent: string, index: number): string {
  if (tk.accentMode === "fixed" && tk.accentFixed) return tk.accentFixed;
  if (tk.accentMode === "cycle" && tk.accentCycle && tk.accentCycle.length > 0) {
    const n = tk.accentCycle.length;
    return tk.accentCycle[((index % n) + n) % n]!;
  }
  return channelAccent;
}

/**
 * `color` laid over the guide's ground, as an opaque `#rrggbb`: what something painted in `color` actually shows against. An `auto`
 * glyph's ink is decided against this (`autoInk` needs an opaque color under the circle's fill).
 */
export const onGround = (tk: Pick<GuideTokens, "bg">, color: string): string => toHex(over(color, tk.bg));

/** What the rail sits on, opaque: the rail's own color over the guide's ground (Aurora's rail is transparent, so it is the ground itself). */
export const railGround = (tk: Pick<GuideTokens, "bg" | "railBg">): string => onGround(tk, tk.railBg);

/** `T` with every field optional, all the way down. Arrays, tuples and null replace wholesale (see `deepMerge`). */
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** What a theme or a color variant says about the tokens: only the fields it changes. */
export type GuideTokenPatch = DeepPartial<GuideTokens>;
