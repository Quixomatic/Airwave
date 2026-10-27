import { nativeGuide, NativeGuideView, type NativeGuideErrorEvent } from "@airwave/native-guide";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Pressable, StyleSheet, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";

import { type GuideGridChannel, imageUrl } from "@/lib/api";
import { getServerUrl } from "@/lib/auth";
import { useGuidePrefs } from "@/lib/guide-prefs";
import { channelTint } from "@/lib/tint";

import { useGuideTokens } from "./use-guide-tokens";
import { logoSource } from "./channel-logo";
import { isVisible, type Lane, programArtPath } from "./geometry";
import { accentOf, cs, FEATURE_SCALE, line, subLine } from "./layout";
import { GLYPH_FALLBACK, GLYPH_HEART, iconNodeOf, resolveIconId, type IconNode } from "./lucide-nodes";
import { auroraGeo, ROW_BORDER_TOP, rowTokens } from "./native-rows-geo";
import { clampScroll, followScroll, GlyphSync, Handover, hitRow, type LineupApplied, type LineupResolvers, type NativeScroll } from "./native-rows-logic";

/**
 * The Aurora guide's channel rows drawn by ONE native view (packages/native-guide): the native rows. AuroraGrid mounts
 * this in place of its FlashList of React Native rows when `useGuideRenderer` says so; everything around the rows (the
 * featured panel, time header, now marker, sidebar, the key layer) is unchanged.
 *
 * The view only draws, so a tap (a touch screen, or the pointer of a mouse or an air remote) is placed on the rows here, with the
 * same cell arithmetic the React Native rows' Pressables use (`hitRow`), and goes to the same handlers they call: tap to focus, tap
 * the focused thing to activate.
 *
 * The lineup goes over once per lineup change, incrementally (`LineupSync`); a D-pad move only changes a few small props
 * (the focused row and program, the zone, the scroll offset). The scroll offset is decided HERE, by the same rule the
 * FlashList follows (`followScroll`), so the focused row is always on screen.
 *
 * More than one guide can be mounted at once: `router.replace("/guide")` from Settings stacks a second guide and the first stays
 * mounted beneath it. So nothing about a lineup is shared between instances: each has its own native lineup store (named by
 * `lineupId`) and its own hand-over state, and unmounting one clears only its own.
 */
/** Identifies this JS context to the native stores (a reload restarts the token numbering, and the stores of the old context are dropped). */
const SESSION = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
let instances = 0;
/** The icons the native side holds. Shared on purpose: a registered icon is the same for every instance, and nothing ever unregisters one. */
const glyphs = new GlyphSync();

/** A new instance's hand-over state (see `Handover`: it makes no native store until the instance has committed). */
const newHandover = (): Handover => new Handover(`${SESSION}-${++instances}`, SESSION);

const resolvers: LineupResolvers = {
  icon: (ch) => resolveIconId(ch.icon ?? ch.package?.icon),
  sub: subLine,
  accent: (ch, index) => channelTint(ch) ?? accentOf(index),
};

/** Gives the native store the icons the lineup (and the favorite heart) draw, once each. Throws if the store refuses them. */
function sendGlyphs(channels: readonly GuideGridChannel[]): void {
  const ng = nativeGuide;
  if (!ng) return;
  const missing = glyphs.missing([GLYPH_FALLBACK, GLYPH_HEART, ...channels.map(resolvers.icon)]);
  if (missing.length === 0) return;
  const table: Record<string, IconNode> = {};
  for (const id of missing) {
    const node = iconNodeOf(id);
    if (node) table[id] = node;
  }
  ng.setGlyphs(JSON.stringify(table));
  glyphs.markSent(missing);
}

/** With program art on, each program also carries the artwork URL the classic rows request (up to its query: the native view
 *  adds the pixel box), so a cell's image is fetched and cached once whichever renderer draws it. */
const artResolvers: Pick<LineupResolvers, "art"> = { art: (ch, p) => imageUrl(ch.id, programArtPath(p.guide)) };

/** Never throws (`applyLineupUpdate`): a failure comes back as `error`, reported after render. */
function applyLineup(h: Handover, channels: readonly GuideGridChannel[], favoriteIds: Set<string>, fromMs: number, r: LineupResolvers): LineupApplied {
  const ng = nativeGuide;
  if (!ng) return { version: 0, error: null };
  return h.apply(
    (id, json) => {
      sendGlyphs(channels);
      return ng.setLineup(id, json);
    },
    channels,
    favoriteIds,
    r,
    fromMs,
  );
}

export type NativeRowsProps = {
  /** The lineup in display order: the raw channel objects `useGuide` returned (see `LineupSync`), already filtered by the lens. */
  channels: readonly GuideGridChannel[];
  favoriteIds: Set<string>;
  /** The focused row, and the id of the selected program in it. */
  fc: number;
  focusProgramId: string | undefined;
  zone: "grid" | "rail" | "sidebar";
  miniFocused: boolean;
  // The grid's geometry (dp), as AuroraGrid computes it.
  rowPx: number;
  railPx: number;
  laneW: number;
  ppm: number;
  originMs: number;
  nowMs: number;
  gap: number;
  vw: (px: number) => number;
  /** Written with the scroll offset (and the view's height) the rows are drawn at, so a fallback to the React Native rows can open its list at the same place. */
  scrollOut?: RefObject<NativeScroll>;
  /** A tap on a row's rail, and on a program's cell (its index among the programs the row draws). */
  onRailTap: (index: number) => void;
  onProgramTap: (index: number, programIndex: number) => void;
  /** The native rows failed: the guide switches back to the React Native rows. */
  onError: (message: string) => void;
};

export const NativeRows = memo(function NativeRows({
  channels,
  favoriteIds,
  fc,
  focusProgramId,
  zone,
  miniFocused,
  rowPx,
  railPx,
  laneW,
  ppm,
  originMs,
  nowMs,
  gap,
  vw,
  scrollOut,
  onRailTap,
  onProgramTap,
  onError,
}: NativeRowsProps) {
  const tk = useGuideTokens();
  // This instance's own native lineup store and hand-over state: see the header.
  const [handover] = useState(newHandover);
  const { art, marks } = useGuidePrefs();
  const serverUrl = getServerUrl();
  // What the lineup is packed with: program art and channel logos are only packed (so only fetched) when they are chosen.
  const lineupResolvers = useMemo<LineupResolvers>(() => {
    if (art !== "on" && marks !== "logos") return resolvers;
    return {
      ...resolvers,
      ...(art === "on" ? { ...artResolvers, artKey: serverUrl } : {}),
      ...(marks === "logos" ? { logo: (ch: GuideGridChannel) => logoSource(ch.logo, serverUrl) } : {}),
    };
  }, [art, marks, serverUrl]);
  // Bumped when the instance commits (and again if it is remounted), to send the lineup: see `Handover`.
  const [generation, setGeneration] = useState(0);
  // Synchronous on purpose, once the instance has committed: the native store must hold this lineup before the view's next frame, so the view
  // never draws a lineup that is not the one its focus and scroll props are for. (The first commit has none; the layout effect below sends it
  // before anything is painted.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const applied = useMemo(() => applyLineup(handover, channels, favoriteIds, originMs, lineupResolvers), [handover, channels, favoriteIds, originMs, lineupResolvers, generation]);
  // A lineup the native store couldn't take is reported after render (it switches the guide to the React Native rows,
  // which re-renders other components: not allowed mid-render).
  useLayoutEffect(() => {
    if (applied.error) onError(applied.error);
  }, [applied, onError]);
  useLayoutEffect(() => {
    handover.commit();
    setGeneration((g) => g + 1);
    // Unmounted (the guide switched to the React Native rows, or the screen went): free this instance's native copy of the lineup, and no other's.
    return () => handover.release((id) => nativeGuide?.clearLineup(id));
  }, [handover]);

  // The geometry does not include the time: it moves every minute and only the live cells' progress follows it (the `nowMs` prop).
  const geoJson = useMemo(
    () => JSON.stringify(auroraGeo({ rowPx, railPx, laneW, ppm, originMs, gap, featureScale: FEATURE_SCALE }, { vw, cs, line }, tk)),
    [rowPx, railPx, laneW, ppm, originMs, gap, vw, tk],
  );
  const tokensJson = useMemo(() => JSON.stringify(rowTokens(tk)), [tk]);

  const [viewH, setViewH] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setViewH(e.nativeEvent.layout.height), []);
  const handleError = useCallback((e: NativeGuideErrorEvent) => onError(e.nativeEvent.message), [onError]);

  // The scroll offset: follows the focused row while the grid or rail has focus, as the FlashList does. Derived from the
  // previous offset, so it lives in a ref; computing it twice with the same inputs gives the same answer.
  const scrollRef = useRef(0);
  const follow = zone === "grid" || zone === "rail";
  const scrollY = follow ? followScroll(scrollRef.current, fc, rowPx, viewH, channels.length) : clampScroll(scrollRef.current, rowPx, viewH, channels.length);
  scrollRef.current = scrollY;
  if (scrollOut) {
    scrollOut.current.y = scrollY;
    scrollOut.current.h = viewH;
  }

  const lane = useMemo<Lane>(() => ({ T0: new Date(originMs), ppm, laneW, gap }), [originMs, ppm, laneW, gap]);
  const onPress = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX, locationY } = e.nativeEvent;
      const hit = hitRow(locationX, locationY, {
        scrollY: scrollRef.current,
        rowPx,
        railPx,
        top: ROW_BORDER_TOP,
        inset: vw(6),
        lane,
        programsAt: (row) => channels[row]?.programs.filter((p) => isVisible(p, lane)),
      });
      if (!hit) return;
      if (hit.part === "rail") onRailTap(hit.row);
      else onProgramTap(hit.row, hit.index);
    },
    [channels, rowPx, railPx, vw, lane, onRailTap, onProgramTap],
  );

  if (!NativeGuideView) return null;
  return (
    // Not focusable and not an accessibility node of its own: the D-pad is the zone machine's, and the native view carries the guide's description.
    <Pressable style={styles.fill} onLayout={onLayout} onPress={onPress} focusable={false} accessible={false}>
      <NativeGuideView
        style={StyleSheet.absoluteFill}
        lineupId={handover.id}
        lineupVersion={applied.version}
        geo={geoJson}
        nowMs={nowMs}
        tokens={tokensJson}
        focusRow={fc}
        focusProgramId={focusProgramId ?? ""}
        zone={zone}
        miniFocused={miniFocused}
        scrollY={scrollY}
        onRenderError={handleError}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({ fill: { flex: 1, overflow: "hidden" } });
