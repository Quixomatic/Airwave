import { hasLogoPlate } from "./channel-logo";
import { WINDOW_MIN } from "./geometry";
import type { GuideTokens } from "./guide-tokens";

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

/** The JSON object the native view's `geo` prop carries. Sizes are dp. */
export function auroraGeo(i: AuroraGeoInput, s: Scalers, tk: GuideTokens) {
  const { vw, cs, line } = s;
  return {
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
    numberSize: vw(34),
    nameSize: vw(23),
    nameLine: vw(23) * 1.2,

    // Cells.
    cellTop: vw(6),
    cellInset: vw(12), // a cell is the row's height less this
    cellRadius: cs(tk.cellRadius),
    cellBorder: line(tk.cellBorderW),
    cellRing: line(tk.ringW),
    liveBarX: vw(3),
    liveBarInset: vw(10),
    liveBarW: line(tk.liveBar.w),
    liveBarR: line(tk.liveBar.r),
    padTop: vw(20),
    padX: vw(20),
    titleSize: vw(34),
    subSize: vw(26),
    subGap: vw(12),
  };
}

export type AuroraGeo = ReturnType<typeof auroraGeo>;

/**
 * The JSON object the native view's `tokens` prop carries: the colors, accent alphas and weights the rows draw with. A
 * program's art is a URL in the lineup, not a token: the painter draws it when there is one, with `artScrim` over it and
 * `artTitle` / `artSub` for the text.
 */
export function rowTokens(tk: GuideTokens) {
  return {
    rowBorder: tk.rowBorder,
    cellBg: tk.cellBg,
    liveCellBg: tk.liveCellBg,
    cellBorder: tk.cellBorder,
    ring: tk.ring,
    liveFill: { elapsed: tk.liveFill.elapsed, remain: tk.liveFill.remain },
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
    logoPlate: tk.logoPlate,
    // Program art, when the cells show it: the scrim over it (left to right) and the text colors on it.
    artScrim: [tk.artScrim[0], tk.artScrim[1]],
    artTitle: tk.artTitle,
    artSub: tk.artSub,
  };
}
