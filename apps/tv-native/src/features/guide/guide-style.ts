import { autoInk, compositeCss, hexA } from "./color";
import { FIXED_WEIGHTS, resolveFontWeight } from "./guide-fonts";
import { type GuideFontWeight, type GuideGradient, type GuideMisregister, type GuideShadow, type GuideStatusLabel, type GuideTextRole, type GuideTokens, onGround } from "./guide-tokens";

/**
 * The React Native guide's styling decisions as pure functions of the tokens: which color a piece of text is in each cell state,
 * what a text role's style object is, where the rings and ticks go. The components (aurora-grid.tsx, guide-parts.tsx) turn the
 * answers into views. Kept free of react-native imports so bun can test every rule, and so a rule reads once instead of being
 * repeated in each component.
 *
 * A function that has to scale a size takes the scalers as arguments (`vw`: design px to dp, `ln`: a width in `line()` units to dp).
 */

// ---------------------------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------------------------

/** The text style fields a theme's typography sets. A field that has its React Native default is left out. */
export type FaceStyle = {
  fontSize: number;
  fontFamily?: string;
  fontWeight?: GuideFontWeight;
  fontStyle?: "italic";
  letterSpacing?: number;
  textTransform?: "uppercase";
  /** Android only: leave out the font's extra top and bottom padding, so a tall display face sits where its line box puts it. */
  includeFontPadding?: boolean;
};

/**
 * A line of text in one of the theme's two faces: `size` dp, with the weight, tracking (em), case and slant the caller asks for.
 * The system font (the `null` family) leaves `fontFamily` unset, and a weight of 400 is left out because it is React Native's own. A bundled
 * face is set without the font's padding (an Android text style), which the display faces' tall metrics would otherwise add. The weight is
 * the one the family has that stands in for what was asked (`resolveFontWeight`): a face never falls back to another by accident.
 */
export function faceText(tk: GuideTokens, which: "text" | "display", size: number, o: { weight?: GuideFontWeight; track?: number; upper?: boolean; italic?: boolean } = {}): FaceStyle {
  const family = tk.typeStyle[which]?.family;
  const out: FaceStyle = { fontSize: size };
  if (family) {
    out.fontFamily = family;
    out.includeFontPadding = false;
  }
  const weight = o.weight && resolveFontWeight(family, o.weight, !!o.italic);
  if (weight && weight !== "400") out.fontWeight = weight;
  if (o.italic) out.fontStyle = "italic";
  if (o.track) out.letterSpacing = o.track * size;
  if (o.upper) out.textTransform = "uppercase";
  return out;
}

/**
 * The weight the guide's own text `use` (FIXED_WEIGHTS: the ones set outside the theme's text roles) is set in, in the theme's face for it. For text
 * nested in another (the episode in the featured title), which only sets the weight and takes the face from its parent.
 */
export function fixedWeight(tk: GuideTokens, use: keyof typeof FIXED_WEIGHTS): GuideFontWeight {
  const { face, weight } = FIXED_WEIGHTS[use];
  const ts = tk.typeStyle;
  const which = face === "featured" ? ts.featured.font : face;
  return resolveFontWeight(ts[which]?.family, weight, face === "featured" && ts.featured.italic);
}

/**
 * The style of a text role: its face, weight, tracking, case and slant, at `size` dp (its Aurora size) times the role's own
 * `scale` and the theme's `fontScale`. Aurora's roles give `{ fontSize: size, fontWeight }` and nothing else.
 */
export function roleText(tk: GuideTokens, role: GuideTextRole, size: number): FaceStyle {
  const r = tk.typeStyle[role];
  return faceText(tk, r.font, size * r.scale * tk.fontScale, { weight: r.weight, track: r.track, upper: r.case === "upper", italic: r.italic });
}

/** The colors a cell's title and sub-line are drawn in. Art under the whole cell has its own, which wins; then the selected cell's, then an on-now cell's. */
export function cellTextColors(tk: GuideTokens, s: { selected: boolean; live: boolean; artFull: boolean }): { title: string; sub: string } {
  if (s.artFull) return { title: tk.artTitle, sub: tk.artSub };
  if (s.selected && tk.focusText) return { title: tk.focusText.title, sub: tk.focusText.sub };
  if (s.live && tk.liveText) return { title: tk.liveText.title, sub: tk.liveText.sub };
  return { title: tk.title, sub: tk.sub };
}

// ---------------------------------------------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------------------------------------------

/** A cell's fill and outline for its state. The selected cell's outline is the focus ring; a dashed outline is for a cell that is neither on now nor selected. */
export function cellSurface(tk: GuideTokens, s: { selected: boolean; live: boolean }) {
  const resting = s.live ? tk.liveCellBg : tk.cellBg;
  return {
    bg: s.selected ? (tk.cellFocusBg ?? resting) : resting,
    /** `line()` units. */
    borderW: s.selected ? tk.ringW : tk.cellBorderW,
    borderColor: s.selected ? tk.ring : tk.cellBorder,
    dashed: !s.selected && !s.live && tk.cellBorderDash !== null,
  };
}

/** The shadow under a cell: the selected cell's own when the theme has one, else the resting shadow, else none. */
export const cellShadow = (tk: GuideTokens, selected: boolean): GuideShadow | null => (selected ? (tk.shadowFocus ?? tk.shadow) : tk.shadow);

/**
 * How far a hard shadow pushes the cell's visible body in, in design px: the body is the cell's box minus the largest offset, so the
 * shadow sits inside the box and the box (and with it the cull and the touch target) never changes. An outer shadow takes nothing.
 */
export function shadowInset(sh: GuideShadow | null): { dx: number; dy: number } {
  if (!sh || !sh.inside) return { dx: 0, dy: 0 };
  return { dx: Math.max(0, ...sh.steps.map((s) => s.dx)), dy: Math.max(0, ...sh.steps.map((s) => s.dy)) };
}

/**
 * Whether a theme draws its program cells in a frame: a shadow, rings or a misregistered ring around the cell's body. It is a property of the theme and
 * not of the cell's state (a ring shows on the selected cell only, a shadow can be there only for the selected one), so a cell has the same views focused
 * and unfocused and a focus change updates it in place: a cell that changed its views with its focus would be built again, and its image loaded again
 * and its text measured again, on every D-pad step.
 */
export function themeFramesCells(tk: GuideTokens): boolean {
  return cellShadow(tk, false) !== null || cellShadow(tk, true) !== null || tk.ringOuter !== null || (tk.halo?.length ?? 0) > 0 || !!tk.misregister?.shapes.includes("ring");
}

/** One ring around the selected cell, outside its border box: `out` dp from the box to the ring's outer edge, `w` thick. */
export type RingLayer = { out: number; w: number; color: string; dashed: boolean };

/**
 * The rings drawn outside the selected cell's own outline, innermost first: the double ring (a gap, then a stroke) and then the
 * halo's strokes, each starting where the one before stopped. `vw` scales the gap and a halo stroke, `ln` the double ring's width.
 */
export function ringLayers(tk: GuideTokens, fg: string, s: { vw: (px: number) => number; ln: (px: number) => number }): RingLayer[] {
  const out: RingLayer[] = [];
  let off = 0;
  if (tk.ringOuter) {
    const w = s.ln(tk.ringOuter.w);
    off += s.vw(tk.ringOuter.gap) + w;
    out.push({ out: off, w, color: tk.ringOuter.color, dashed: tk.ringOuter.dash !== null });
  }
  for (const h of tk.halo ?? []) {
    const w = s.vw(h.w);
    off += w;
    out.push({ out: off, w, color: hexA(h.color === "accent" ? fg : h.color, h.a), dashed: false });
  }
  return out;
}

/**
 * Whether a line of text that was laid out on one line (`numberOfLines={1}`) had to be cut to fit, from the lines its `onTextLayout`
 * reports: Android lays out the cut text, with an ellipsis (U+2026) written into it and padded with zero-width no-break spaces
 * (U+FEFF), and a line that wrapped is more than one line. A kicker label (a time or "ON NOW") has neither of those characters.
 */
export const lineWasCut = (lines: readonly { text: string }[]): boolean => lines.length > 1 || lines.some((l) => /[\u2026\uFEFF]/.test(l.text));

/** Whether a plate or burst label fits on a cell `widthDesign` design px wide. */
export const labelFits = (sl: Extract<GuideStatusLabel, { minCell: number }>, widthDesign: number): boolean => widthDesign >= sl.minCell;

/** The status label's points of a burst: `points` vertices alternating between 50 and 38 per cent of the box, as `[x, y]` in 0..100, starting at the top. */
export function burstPoints(points = 24, outer = 50, inner = 38): [number, number][] {
  return Array.from({ length: points }, (_, k) => {
    const a = ((k * 360) / points - 90) * (Math.PI / 180);
    const r = k % 2 === 0 ? outer : inner;
    return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
  });
}

/**
 * The start and end of a CSS-angled gradient on a `w` x `h` box, as fractions of the box (what a gradient view takes): the line
 * passes through the centre at `angle` degrees clockwise from up and is just long enough for the corners to land on its ends.
 */
export function gradientPoints(angle: GuideGradient["angle"], w: number, h: number): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return {
    start: { x: (cx - dx * half) / w, y: (cy - dy * half) / h },
    end: { x: (cx + dx * half) / w, y: (cy + dy * half) / h },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Misregistered ink
// ---------------------------------------------------------------------------------------------------------------

/** How far the second ink of a misregistered line or shape sits from the first, as a style `transform` (dp). */
export const misShift = (mis: Pick<GuideMisregister, "dx" | "dy">, vw: (px: number) => number) => ({
  transform: [{ translateX: vw(mis.dx) }, { translateY: vw(mis.dy) }],
});

/**
 * How far the paper behind a misregistered line reaches past the box of the line, as insets (negative = outward, dp): a pixel all round
 * and as far again as the second ink is moved, so the back copy, which lies out of the box by (dx, dy), is multiplied with paper too.
 */
export function misPaper(mis: Pick<GuideMisregister, "dx" | "dy">, vw: (px: number) => number): { left: number; top: number; right: number; bottom: number } {
  const dx = vw(mis.dx);
  const dy = vw(mis.dy);
  return { left: -(1 + Math.max(0, -dx)), top: -(1 + Math.max(0, -dy)), right: -(1 + Math.max(0, dx)), bottom: -(1 + Math.max(0, dy)) };
}

/** The parts of a misregistered print the classic rows draw twice. */
export type MisPart =
  /** The second ink's copy of a line of text. */
  | "back-text"
  /** The line itself, over its copy. */
  | "front-text"
  /** The second ink's copy of the selected cell's ring. */
  | "ring"
  /** The second ink's copy of a channel circle's rim. */
  | "rim"
  /** The second ink's copy of the now marker's triangle. */
  | "marker";

/**
 * Which parts are blended with `mixBlendMode: "multiply"`, and which are only moved. A blend is not free on Android: React Native draws a
 * blended view by putting its PARENT in an offscreen layer (and the view in another) every frame, the size of that parent. Everything the
 * guide misregisters is blended, so that the second ink and the first mix with the paper under them, except:
 *  - the now marker's copy. Its parent would be the whole of the rows' container (a layer the size of the rows, with the native rows, or
 *    the list of React Native rows, drawn into it, two such layers a frame), and its tip overlaps the first row's rule by a pixel or two,
 *    so it is only moved.
 * Where the blended parent is made small and has the paper in it, see `MisText` and `MisLabels`.
 */
export const misBlend = (part: MisPart, blend: GuideMisregister["blend"] = "multiply"): "multiply" | undefined => (blend === "multiply" && part !== "marker" ? "multiply" : undefined);

/**
 * The tokens with the two inks of a misregistered print drawn plainly, the second one just behind the first and nothing blended. For a
 * picture of a theme at a third of its size (the Settings preview): every blended view is two offscreen layers a frame, and a full
 * guide in Risograph has a hundred of them, which is a lot to pay for the dark hairline where two glyphs overlap.
 */
export const plainInk = (tk: GuideTokens): GuideTokens => (tk.misregister ? { ...tk, misregister: { ...tk.misregister, blend: "plain" } } : tk);

// ---------------------------------------------------------------------------------------------------------------
// Ticks
// ---------------------------------------------------------------------------------------------------------------

export type Tick = { x: number; major: boolean };

/**
 * The ticks of a programme's dimension line. They fall every `step` dp counted from the programme's real start, which lies `phase`
 * dp left of the visible edge when the cell is clamped against the rail, so a tick keeps its minute and the majors (every
 * `majorEvery` ticks from the start) keep theirs. Ticks left of the edge or right of `width` are not returned.
 */
export function dimensionTicks(width: number, step: number, phase: number, majorEvery: number): Tick[] {
  const out: Tick[] = [];
  if (!(step > 0)) return out;
  for (let k = 0, x = 0 - phase; x <= width + 0.5; k++, x += step) {
    if (x < 0) continue;
    out.push({ x, major: k % majorEvery === 0 });
  }
  return out;
}

/** The time header's ruler: a tick every `every` minutes over `windowMin`, majors every `majorEvery` minutes, `ppm` dp per minute. */
export function rulerTicks(windowMin: number, ppm: number, every: number, majorEvery: number): Tick[] {
  const out: Tick[] = [];
  for (let m = 0; m <= windowMin; m += every) out.push({ x: m * ppm, major: m % majorEvery === 0 });
  return out;
}

/** A coordinate as it is written in SVG path data: three decimals at most, and no trailing zeros. */
const num = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * The ticks as ONE SVG path: a vertical stroke from `baseY` to `baseY - rise(major)` at each tick's x. Ticks that share a stroke
 * width and color are drawn by one `Path` rather than a `Line` apiece, which is the same picture (butt caps, no overlap) for one view
 * to create, update and draw instead of dozens: a dimension line has up to 40 ticks and the time header's ruler as many again, and the
 * featured panel's is rebuilt on every move of the focus.
 */
export function tickPath(ticks: readonly Tick[], baseY: number, rise: (major: boolean) => number): string {
  let d = "";
  for (const t of ticks) d += `${d ? " " : ""}M${num(t.x)} ${num(baseY)}L${num(t.x)} ${num(baseY - rise(t.major))}`;
  return d;
}

/** Vertical strokes at each x from `y1` to `y2`, as one SVG path (see `tickPath`): a dimension line's two end caps. */
export function verticalsPath(xs: readonly number[], y1: number, y2: number): string {
  return xs.map((x) => `M${num(x)} ${num(y1)}L${num(x)} ${num(y2)}`).join(" ");
}

// ---------------------------------------------------------------------------------------------------------------
// Channel circle and rail
// ---------------------------------------------------------------------------------------------------------------

/**
 * The colors of a channel circle. `accent` is the row's accent (a tint), `fg` the same as a mark (see `accentFg`); `rowFocused` is
 * true on the focused row, `featured` for the featured panel's tile (which never takes the focused rail's colors); `under` is the
 * opaque color behind the circle, which decides `auto` glyph ink.
 */
export function circleColors(tk: GuideTokens, o: { accent: string; fg: string; rowFocused: boolean; featured: boolean; under: string }) {
  const st = tk.circleStyle;
  const rf = !o.featured && o.rowFocused ? tk.railFocus : null;
  let fill = st.fill === "accent" ? hexA(o.accent, tk.circle.fillA) : st.fill === "accent-solid" ? o.accent : st.fill === "none" ? "transparent" : st.fill;
  if (rf?.circle) fill = rf.circle;
  const border = st.border === "accent" ? hexA(o.fg, tk.circle.borderA) : st.border;
  let glyph = rf?.glyph ?? (st.glyph === "accent" ? o.fg : st.glyph);
  if (glyph === "auto") glyph = autoInk(fill, o.under);
  return { fill, border, glyph };
}

/** What the featured panel's tile and text are printed on, opaque: its plate (over the guide's ground), else the ground itself. */
export const featuredGround = (tk: GuideTokens): string => onGround(tk, tk.featuredPlate?.bg ?? tk.bg);

/** A focused row's rail background: the theme's solid color, else the row's accent at `railFocusAlpha` over the rail's own fill. */
export function railBackground(tk: GuideTokens, accent: string, focused: boolean): string {
  if (!focused) return tk.railBg;
  if (tk.railFocus) return tk.railFocus.bg;
  const wash = hexA(accent, tk.railFocusAlpha);
  return tk.railBg === "transparent" ? wash : compositeCss(wash, tk.railBg);
}

// ---------------------------------------------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------------------------------------------

/**
 * The featured panel's progress bar. With no theme progress (`none`) it is Aurora's thin rounded bar; any other style gives a
 * bar in that style (design px), and `ticks` a dimension line.
 */
export function featuredProgress(tk: GuideTokens, fg: string) {
  const p = tk.progress;
  if (p.style === "ticks" && p.ticks) return { kind: "ticks" as const, ticks: p.ticks, h: p.h };
  const none = p.style === "none";
  return {
    kind: "bar" as const,
    /** Design px; `null` leaves the panel's own height. */
    h: none ? null : Math.max(6, p.h * 0.75),
    r: none ? null : p.r,
    border: none ? null : p.trackBorder,
    track: none || p.track === "transparent" ? tk.featured.track : p.track,
    fill: none || p.fill === "accent" ? fg : p.fill,
  };
}
