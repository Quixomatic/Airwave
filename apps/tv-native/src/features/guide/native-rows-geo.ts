import { hasLogoPlate } from "./channel-logo";
import { WINDOW_MIN } from "./geometry";
import { type GuideTokens, railGround } from "./guide-tokens";

/**
 * What the native rows are told about the Aurora row: its dimensions (`auroraGeo`, dp) and its colors (`rowTokens`).
 *
 * The dimensions are AuroraGrid's own expressions (`vw()`, `cs()`, `line()`), which depend on the screen, so they are
 * computed here in JS and sent as dp; the native painter multiplies by the display density and never re-derives a size.
 * Every key below is read by `AuroraLayout` / `AuroraPainter` (packages/native-guide), and the fixture
 * `aurora-fixture.json` (generated from this file) lets the Kotlin tests check that none is missing.
 *
 * No react-native imports, so `bun test` can load this file: the scalers come in as arguments.
 */
export type Scalers = {
  /** spec px (at 2560 wide) -> dp. */
  vw: (px: number) => number;
  /** Raw-dp chrome value -> dp (identity except on Android TV). */
  cs: (px: number) => number;
  /** Hairline: scaled and snapped to a whole physical pixel. */
  line: (px: number) => number;
};

export type AuroraGeoInput = {
  /** One row's height, and the channel rail's width (dp). */
  rowPx: number;
  railPx: number;
  /** The timeline's width in dp, and dp per minute along it. */
  laneW: number;
  ppm: number;
  /** The timeline's left edge (epoch ms). The current time is not part of the geometry: it is its own prop of the native view, so a clock tick never rebuilds the layout. */
  originMs: number;
  /** dp between adjacent cells. */
  gap: number;
  /** The guide's FEATURE_SCALE: the rail circle and its icon are drawn at this share of the featured tile's size. */
  featureScale: number;
};

/** The row's top rule, in dp: `borderTopWidth: 1` in the React Native row, a plain dp (not `line(1)`). The cells and the rail sit below it, which a tap's hit test has to know too. */
export const ROW_BORDER_TOP = 1;

/**
 * The JSON object the native view's `geo` prop carries. Sizes are dp.
 *
 * A theme can set a width or radius to 0 (a borderless cell, a square bar, no outer ring): 0 stays 0 rather than snapping up
 * to a hairline, as `ln` in aurora-grid.tsx does. `fontScale` scales the text sizes only; every position stays where it is.
 */
export function auroraGeo(i: AuroraGeoInput, s: Scalers, tk: GuideTokens) {
  const { vw, cs, line } = s;
  const ln = (px: number) => (px > 0 ? line(px) : 0);
  const fs = tk.fontScale;
  return {
    // dp per design px: what `vw(1)` is on this screen. The sizes a theme adds (shadows, progress, textures, ...) travel in the
    // tokens in design px, and the painter multiplies them by this.
    unit: vw(1),
    // The lane's coordinate system: the same inputs `cellBox` takes in JS, so both cull and place cells identically.
    rowH: i.rowPx,
    railW: i.railPx,
    laneW: i.laneW,
    ppm: i.ppm,
    originMs: i.originMs,
    windowMin: WINDOW_MIN,
    gap: i.gap,

    // Row and rail.
    borderTop: ROW_BORDER_TOP,
    padV: vw(18),
    padH: vw(20),
    barW: vw(4), // the focused rail's accent bar
    circle: vw(64 * i.featureScale),
    circleBorder: line(1),
    circleRing: line(tk.ringW),
    glyph: vw(34 * i.featureScale),
    badge: vw(22),
    badgeOff: vw(4),
    // A channel's logo, in place of the circle: a box as tall as the circle, as wide as the rail leaves beside the number. A
    // theme's plate behind it insets the logo by `logoPad`.
    logoGap: vw(8),
    logoPad: hasLogoPlate(tk.logoPlate) ? vw(4) : 0,
    logoRadius: cs(6),
    numberSize: vw(34) * fs,
    nameSize: vw(23) * fs,
    nameLine: vw(23) * fs * 1.2,

    // Cells.
    cellTop: vw(6),
    cellInset: vw(12), // a cell is the row's height less this
    cellRadius: cs(tk.cellRadius),
    cellBorder: ln(tk.cellBorderW),
    cellRing: line(tk.ringW),
    ringOuterW: tk.ringOuter ? ln(tk.ringOuter.w) : 0, // the selected cell's second ring, drawn outside its box
    liveBarX: vw(3),
    liveBarInset: vw(10),
    liveBarW: ln(tk.liveBar.w),
    liveBarR: ln(tk.liveBar.r),
    padTop: vw(20),
    padX: vw(20),
    titleSize: vw(34) * fs,
    subSize: vw(26) * fs,
    subGap: vw(12),
  };
}

export type AuroraGeo = ReturnType<typeof auroraGeo>;

/**
 * The JSON object the native view's `tokens` prop carries: the colors, accent alphas and weights the rows draw with, and what a
 * theme adds to them.
 * `liveFill` is the accent at two alphas (mode "tint") or two fixed colors (mode "neutral"); `ringOuter` is the selected cell's
 * second ring (`{ color, gap, dash }`; its width is `ringOuterW` in `geo`), or null; a row's mark color comes from `accentShade`,
 * `accentFixed` and `title` the way `accentFg` derives it. A program's art is a URL in the lineup, not a token: the painter
 * draws it when there is one, with `artScrim` over it and `artTitle` / `artSub` for the text.
 *
 * What themes added goes over as it is in the token set (`GuideLook` in packages/native-guide reads it): sizes in it are design
 * px, which the painter turns into dp with `geo.unit`. Every field is sent whether or not the painter draws it, so the two sides
 * read one token set; the colors and sizes of the featured panel, sidebar and time header's own fields (featured, badge, sidebar,
 * glass, ghost, headerDay, headerTick) stay in JS.
 */
export function rowTokens(tk: GuideTokens) {
  return {
    // What the rail sits on, opaque: the rail's own color over the guide's ground. An `auto` glyph's ink is decided against it, as `circleColors` does here.
    railGround: railGround(tk),
    rowBorder: tk.rowBorder,
    cellBg: tk.cellBg,
    liveCellBg: tk.liveCellBg,
    cellBorder: tk.cellBorder,
    ring: tk.ring,
    ringOuter: tk.ringOuter ? { color: tk.ringOuter.color, gap: tk.ringOuter.gap, dash: tk.ringOuter.dash } : null,
    liveFill: { mode: tk.liveFill.mode, elapsed: tk.liveFill.elapsed, remain: tk.liveFill.remain },
    title: tk.title,
    titleWeight: tk.titleWeight,
    sub: tk.sub,
    railFocusAlpha: tk.railFocusAlpha,
    circle: { fillA: tk.circle.fillA, borderA: tk.circle.borderA },
    heartOff: tk.heartOff,
    fav: tk.fav,
    number: tk.number,
    numberFocused: tk.numberFocused,
    numberWeight: tk.numberWeight,
    name: tk.name,
    accentShade: tk.accentShade,
    accentFixed: tk.accentFixed,
    logoPlate: tk.logoPlate,
    // Program art, when the cells show it: the scrim over it (left to right) and the text colors on it.
    artScrim: [tk.artScrim[0], tk.artScrim[1]],
    artTitle: tk.artTitle,
    artSub: tk.artSub,
    // What themes added.
    typeStyle: tk.typeStyle,
    accentMode: tk.accentMode,
    accentCycle: tk.accentCycle,
    rowBorderW: tk.rowBorderW,
    railBg: tk.railBg,
    railFocus: tk.railFocus,
    railBar: tk.railBar,
    railDivider: tk.railDivider,
    railLayout: tk.railLayout,
    circleStyle: tk.circleStyle,
    glyphStroke: tk.glyphStroke,
    cellFocusBg: tk.cellFocusBg,
    focusText: tk.focusText,
    liveText: tk.liveText,
    cellBorderDash: tk.cellBorderDash,
    cellRule: tk.cellRule,
    shadow: tk.shadow,
    shadowFocus: tk.shadowFocus,
    highlight: tk.highlight,
    halo: tk.halo,
    progress: tk.progress,
    statusLabel: tk.statusLabel,
    art: tk.art,
    patterns: tk.patterns,
    misregister: tk.misregister,
    headerStyle: tk.headerStyle,
    featuredName: tk.featuredName,
    featuredPlate: tk.featuredPlate,
    favStroke: tk.favStroke,
    liveBar: { x: tk.liveBar.x, inset: tk.liveBar.inset, color: tk.liveBar.color },
  };
}
