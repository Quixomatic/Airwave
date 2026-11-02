import { type ReactNode, useId, useMemo } from "react";
import { Image, PixelRatio, Platform, Text, View, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Line, Path, Pattern, Polygon, Rect } from "react-native-svg";

import { grainTile, memoLru, pngDataUri } from "./guide-patterns";
import { burstPoints, dimensionTicks, type FaceStyle, misBlend, type MisPart, misPaper, misShift, rulerTicks, tickPath, verticalsPath } from "./guide-style";
import type { GuideGrain, GuideGrid, GuideHalftone, GuideMisregister, GuideStatusLabel, GuideTicks } from "./guide-tokens";

/**
 * The pieces the themed React Native guide draws that a plain `View` cannot: ink that lands a hair off-register, the NOW burst,
 * dimension lines and rulers, repeating textures and the circle's centre marks. Each takes sizes in dp, already scaled by the
 * caller, so none of them reads the screen.
 *
 * What was checked on Android TV (an API 36 emulator, React Native 0.83 with the New Architecture): `mixBlendMode: "multiply"` blends
 * a text or a view with what is under it, `borderStyle: "dashed"` draws on square and rounded boxes, an `Image` with `resizeMode:
 * "repeat"` tiles its bitmap one image pixel to one screen pixel (a `scale` on the source is ignored), and react-native-svg's
 * `Pattern`, `Polygon` and `Line` draw.
 */

/** `mixBlendMode` is New Architecture only and needs Android 10 (API 29); older Androids draw the back copy plain, with no blending. */
const BLEND = !(Platform.OS === "android" && Number(Platform.Version) < 29);
/** The blend a part of a misregistered print takes (see `misBlend`: some parts are only moved). */
const blendOf = (part: MisPart, mis: Pick<GuideMisregister, "blend">): ViewStyle | undefined => {
  const blend = misBlend(part, mis.blend);
  return BLEND && blend ? { mixBlendMode: blend } : undefined;
};

/**
 * A text line, drawn twice when the theme misregisters it: a back copy in the second ink, moved by (dx, dy), and the line itself
 * in front multiplied with it, so overlapping ink goes dark. With `mis` null it is just the `Text`. The two
 * copies share a box, so they wrap and ellipsize together. `box` is how the line is laid out in its parent (`position`, `flex`,
 * `maxWidth`...): the `Text` takes it as it is, and a misregistered line gives it to the box that holds both copies.
 */
export function MisText({
  mis,
  vw,
  face,
  color,
  numberOfLines,
  fit,
  box,
  under,
  children,
}: {
  mis: GuideMisregister | null;
  vw: (px: number) => number;
  face: TextStyle;
  color: string;
  numberOfLines?: number;
  /** Shrink the text to fit its box rather than clip it (one line). */
  fit?: boolean;
  box?: ViewStyle;
  /**
   * The opaque color the line is printed on (the guide's ground, or a plate). React Native multiplies a blended view with what is in its
   * PARENT's offscreen layer, and when the parent has nothing of its own React Native flattens it away and the layer is the nearest
   * view above, which can be the whole screen. Given `under`, the box that holds the two copies is kept (`collapsable={false}`) and paints
   * the paper behind them, so the layer is the box and the inks still multiply with the paper (the same color as the ground it lies on,
   * so it shows as nothing).
   */
  under?: string;
  /** The text; or a function of the ink the copy is drawn in (`undefined` for the line itself), for a line that has parts in colors of their own. */
  children: ReactNode | ((ink?: string) => ReactNode);
}) {
  const body = (ink?: string) => (typeof children === "function" ? children(ink) : children);
  const shrink = fit ? { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.5 } : { numberOfLines };
  if (!mis) {
    return (
      <Text {...shrink} style={{ ...box, ...face, color }}>
        {body()}
      </Text>
    );
  }
  return (
    <View style={box} collapsable={false}>
      {under && <View pointerEvents="none" style={{ position: "absolute", ...misPaper(mis, vw), backgroundColor: under }} />}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, ...misShift(mis, vw), ...blendOf("back-text", mis) }}>
        <Text {...shrink} style={{ ...face, color: mis.color }}>
          {body(mis.color)}
        </Text>
      </View>
      <View style={blendOf("front-text", mis)}>
        <Text {...shrink} style={{ ...face, color }}>
          {body()}
        </Text>
      </View>
    </View>
  );
}

/**
 * A row of short text labels (the time header's times), each drawn at its own `left` and `top` in the box this fills, misregistered
 * together: every label's back copy goes in one group, moved by (dx, dy), and every label's front copy in one group that is multiplied
 * with the back copies, over the paper (`under`, painted behind both). The labels never overlap one another, so each front copy still
 * multiplies with its own back copy and nothing else, as it would in a `MisText` of its own, and the pixels are the same. React Native
 * puts a blended view's parent and the view in an offscreen layer each frame, so a `MisText` per label costs three layers a label
 * (7 times: 21 layers on a screen that is redrawn on every move of the focus), and the group costs three for all of them. With `mis` null
 * the labels are plain `Text`.
 */
export function MisLabels({
  mis,
  vw,
  face,
  color,
  under,
  labels,
}: {
  mis: GuideMisregister | null;
  vw: (px: number) => number;
  face: TextStyle;
  color: string;
  under: string;
  labels: readonly { left: number; top: number; text: string }[];
}) {
  if (!mis) {
    return (
      <>
        {labels.map((l, i) => (
          <Text key={i} style={{ position: "absolute", left: l.left, top: l.top, ...face, color }}>
            {l.text}
          </Text>
        ))}
      </>
    );
  }
  // Each label sits in a box of its own, as a `MisText` puts it, so it is laid out (and its pixels fall) where it would in one.
  const copy = (ink: string) =>
    labels.map((l, i) => (
      <View key={i} style={{ position: "absolute", left: l.left, top: l.top }}>
        <Text style={{ ...face, color: ink }}>{l.text}</Text>
      </View>
    ));
  const fill = { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 } as const;
  return (
    <View pointerEvents="none" style={fill} collapsable={false}>
      <View pointerEvents="none" style={{ ...fill, backgroundColor: under }} />
      <View pointerEvents="none" style={{ ...fill, ...misShift(mis, vw), ...blendOf("back-text", mis) }}>
        {copy(mis.color)}
      </View>
      <View pointerEvents="none" style={{ ...fill, ...blendOf("front-text", mis) }}>
        {copy(color)}
      </View>
    </View>
  );
}

/** The style of the back copy of a shape the theme misregisters (a ring, a circle's rim, the now marker): moved by (dx, dy) and, where `misBlend` says so, multiplied. */
export const misShapeStyle = (mis: GuideMisregister, vw: (px: number) => number, part: Extract<MisPart, "ring" | "rim" | "marker"> = "rim"): ViewStyle => ({ ...misShift(mis, vw), ...blendOf(part, mis) });

/** The star-shaped burst behind "NOW!": a 24-point star in `outline`, a smaller one in `bg`, and the word at a slant. `size` dp. */
export function Burst({ label, size, vw, face }: { label: Extract<GuideStatusLabel, { mode: "burst" }>; size: number; vw: (px: number) => number; face: FaceStyle }) {
  const pts = useMemo(() => burstPoints().map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "), []);
  return (
    <View pointerEvents="none" style={{ position: "absolute", right: vw(14), top: vw(8), width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Polygon points={pts} fill={label.outline} />
        <Polygon points={pts} fill={label.bg} transform="translate(50 50) scale(0.86) translate(-50 -50)" />
      </Svg>
      <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] }}>
        <Text style={{ ...face, fontSize: size * 0.3, letterSpacing: size * 0.3 * 0.03, color: label.fg }}>{label.text}</Text>
      </View>
    </View>
  );
}

/**
 * A dimension line: a rule with a tick for every few minutes of the programme, taller every few more, end caps and, where it
 * stands now, a mark in `nowColor`. The elapsed part is drawn heavier. Sizes are dp except `t`, which is in design px (`u` dp each).
 */
export function DimensionLine({
  width,
  height,
  pct,
  step,
  phase,
  t,
  u,
  nowColor,
}: {
  width: number;
  height: number;
  /** 0..1 along the line. */
  pct: number;
  /** dp between ticks, and how far the programme's real start lies left of the line's left end. */
  step: number;
  phase: number;
  t: GuideTicks & { capH: number };
  u: number;
  nowColor: string;
}) {
  const y = height - 8 * u;
  const px = width * pct;
  const ticks = useMemo(() => dimensionTicks(width, step, phase, Math.max(1, Math.round(t.majorEvery / t.every))), [width, step, phase, t.majorEvery, t.every]);
  return (
    <Svg width={width} height={height} fill="none" style={{ overflow: "visible" }}>
      <Line x1={0} y1={y} x2={px} y2={y} stroke={t.color} strokeWidth={t.w * 2 * u} />
      <Line x1={px} y1={y} x2={width} y2={y} stroke={t.color} strokeWidth={t.w * u} opacity={0.85} />
      <Path d={tickPath(ticks, y, (major) => (major ? t.majorH : t.minorH) * u)} stroke={t.color} strokeWidth={t.w * u} />
      <Path d={verticalsPath([0.8 * u, width - 0.8 * u], y - (t.capH / 2 - 4) * u, y + (t.capH / 2 - 4) * u)} stroke={t.color} strokeWidth={t.w * 1.5 * u} />
      <Line x1={px} y1={y - (t.capH - 6) * u} x2={px} y2={y + 5 * u} stroke={nowColor} strokeWidth={t.w * 2 * u} />
    </Svg>
  );
}

/** The time header's ruler: ticks standing on the bottom edge across the lane, every `every` minutes, taller every `majorEvery`. */
export function Ruler({ width, height, windowMin, ppm, t, u }: { width: number; height: number; windowMin: number; ppm: number; t: GuideTicks; u: number }) {
  const ticks = useMemo(() => rulerTicks(windowMin, ppm, t.every, t.majorEvery), [windowMin, ppm, t.every, t.majorEvery]);
  return (
    <Svg width={width} height={height} fill="none" style={{ overflow: "visible" }}>
      <Path d={tickPath(ticks, height, (major) => (major ? t.majorH : t.minorH) * u)} stroke={t.color} strokeWidth={t.w * u} />
    </Svg>
  );
}

/** Four short ticks through a circle's centre lines, just outside it (a draftsman's centre marks). `d` is the circle's diameter; `m` is in design px, `u` dp each. */
export function CircleMarks({ d, m, u, color }: { d: number; m: { len: number; gap: number; w: number }; u: number; color: string }) {
  const len = m.len * u;
  const gap = m.gap * u;
  const w = m.w * u;
  const off = -(gap + len);
  const bar = (style: ViewStyle) => <View pointerEvents="none" style={{ position: "absolute", backgroundColor: color, ...style }} />;
  return (
    <>
      {bar({ left: d / 2 - w / 2, top: off, width: w, height: len })}
      {bar({ left: d / 2 - w / 2, bottom: off, width: w, height: len })}
      {bar({ top: d / 2 - w / 2, left: off, width: len, height: w })}
      {bar({ top: d / 2 - w / 2, right: off, width: len, height: w })}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------------------------------------------

const svgId = (raw: string) => raw.replace(/[^a-zA-Z0-9]/g, "");

/**
 * A halftone or graph-paper fill over the whole of its parent (which clips it). Drawn as an SVG pattern, so it is crisp at any
 * scale. `u` is dp per design px. A halftone is two dots per tile, on the tile's diagonal, which makes a 45 degree lattice.
 */
export function PatternFill({ pattern, u }: { pattern: GuideHalftone | GuideGrid; u: number }) {
  const id = svgId(useId());
  if (pattern.kind === "halftone") {
    const pitch = pattern.pitch * u;
    const r = pattern.dot * u;
    return (
      <Svg width="100%" height="100%" pointerEvents="none">
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={pitch} height={pitch}>
            <Circle cx={pitch * 0.25} cy={pitch * 0.25} r={r} fill={pattern.color} />
            <Circle cx={pitch * 0.75} cy={pitch * 0.75} r={r} fill={pattern.color} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    );
  }
  const minor = pattern.minor * u;
  const major = pattern.major * u;
  const w = pattern.w * u;
  return (
    <Svg width="100%" height="100%" pointerEvents="none">
      <Defs>
        <Pattern id={`${id}a`} patternUnits="userSpaceOnUse" width={minor} height={minor}>
          <Rect x={0} y={0} width={minor} height={w} fill={pattern.minorColor} />
          <Rect x={0} y={0} width={w} height={minor} fill={pattern.minorColor} />
        </Pattern>
        <Pattern id={`${id}b`} patternUnits="userSpaceOnUse" width={major} height={major}>
          <Rect x={0} y={0} width={major} height={w} fill={pattern.majorColor} />
          <Rect x={0} y={0} width={w} height={major} fill={pattern.majorColor} />
        </Pattern>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}a)`} />
      <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${id}b)`} />
    </Svg>
  );
}

const grainUris = new Map<string, string>();
/**
 * How many grain tiles stay made. Each is a data URI of up to a few hundred KB, and making one runs on the JS thread, so a tile that is wanted
 * again must not be made again: the guide in use and the Settings preview each have one for the theme and color they show, and the preview walks past
 * them all. Twelve holds a tile for every grain the eight themes have (six, apiece for the guide's size and the preview's) in a few MB.
 */
const GRAIN_URIS_KEPT = 12;

/** The data address of a grain tile made for `pxPerTexel` screen pixels a texel. Made once per distinct grain and size, and only the latest few are kept. */
export function grainUri(grain: Pick<GuideGrain, "tile" | "density" | "alpha" | "colors" | "seed">, pxPerTexel: number): string {
  const key = `${grain.tile}|${grain.density}|${grain.alpha}|${grain.colors.join(",")}|${grain.seed}|${pxPerTexel.toFixed(3)}`;
  return memoLru(grainUris, key, GRAIN_URIS_KEPT, () => pngDataUri(grainTile(grain, pxPerTexel)));
}

/**
 * Paper grain over the whole of its parent: the seeded tile, repeated. The tile is made at screen resolution (a texel is `texel`
 * design px wide, which is a pixel and a half on a 1080p TV), so each image pixel lands on one screen pixel with no resampling, which is
 * how Android draws a repeating image. `scale` tells iOS the same.
 */
export function GrainFill({ grain, u }: { grain: GuideGrain; u: number }) {
  const ratio = PixelRatio.get();
  const uri = grainUri(grain, Math.max(1, grain.texel * u * ratio));
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
      <Image source={{ uri, scale: ratio }} resizeMode="repeat" fadeDuration={0} style={{ width: "100%", height: "100%" }} />
    </View>
  );
}
