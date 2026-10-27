import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { Heart, Star } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, PixelRatio, Platform, Text, useWindowDimensions, View, type ViewStyle } from "react-native";

import { TvPressable as Pressable } from "@/components/tv-pressable";

import { usePlayer } from "@/features/watch/player-ctx";
import { type GuideGridChannel, type GuideGridProgram, type GuideMeta, imageUrl } from "@/lib/api";
import { getServerUrl } from "@/lib/auth";
import { useGuidePrefs } from "@/lib/guide-prefs";
import { LAYER, setBackExitsApp, useKeyLayer } from "@/lib/input";
import { channelTint } from "@/lib/tint";
import { usePackages } from "@/hooks/queries";

import { hasLogoPlate, logoSource } from "./channel-logo";
import { artBox, artUrl, cellBox, isVisible, liveFill, programArtPath, timelineOrigin, type Lane } from "./geometry";
import { GuideGhost } from "./guide-ghost";
import { reportNativeGuideError } from "./guide-renderer";
import { FIXED_WEIGHTS } from "./guide-fonts";
import { Burst, CircleMarks, DimensionLine, GrainFill, MisLabels, MisText, misShapeStyle, PatternFill, Ruler } from "./guide-parts";
import { GuideSidebar, buildSidebarItems, lensEquals, type Lens } from "./guide-sidebar";
import {
  cellShadow,
  cellSurface,
  cellTextColors,
  circleColors,
  faceText,
  featuredGround,
  featuredProgress,
  fixedWeight,
  gradientPoints,
  labelFits,
  lineWasCut,
  railBackground,
  ringLayers,
  roleText,
  shadowInset,
  themeFramesCells,
} from "./guide-style";
import { accentFg, type GuideTokens, railGround, rowAccent } from "./guide-tokens";
import {
  accentOf,
  audioBadge,
  channelIcon,
  cs,
  FEATURE_SCALE,
  fmtDay,
  fmtTime,
  guideMetrics,
  hexA,
  line,
  liveProgramIndex,
  MIN,
  SIDEBAR_SLIVER_W,
  subLine,
  vwOf,
  WINDOW_MIN,
} from "./layout";
import { NativeRows } from "./native-rows";
import { classicFollow, classicHandOver, type NativeScroll } from "./native-rows-logic";
import { useGuideRenderer } from "./use-guide-renderer";
import { useGuideTokens } from "./use-guide-tokens";

/** `line()` for a width or radius a theme may set to 0 (a borderless cell, a square bar): 0 stays 0 instead of snapping up to a hairline. */
const ln = (px: number) => (px > 0 ? line(px) : 0);

const is4K = (res?: string) => res === "4k";
const isHD = (res?: string) => !!res && res !== "sd" && res !== "480";

/** The Aurora guide grid — ported from tv-web. Same vw-scaled layout, featured panel, time-grid,
 *  sidebar sliver/expand, now-marker, and GuideGhost. Touch drives selection (tap a row to select →
 *  the featured panel + highlight follow; tap again to tune); the sidebar Filters circle expands. */
export function AuroraGrid({
  channels: rawChannels,
  serverTime,
  favoriteIds,
  onToggleFavorite,
  onTune,
  onSettings,
  onAccount,
}: {
  channels: GuideGridChannel[];
  serverTime: string;
  favoriteIds: Set<string>;
  onToggleFavorite: (channelId: string) => void;
  onTune: (channelId: string) => void;
  onSettings: () => void;
  onAccount: () => void;
}) {
  const { width } = useWindowDimensions();
  const vw = useCallback((px: number) => vwOf(width, px), [width]);
  const tk = useGuideTokens();

  const now = useMemo(() => new Date(serverTime), [serverTime]);
  const T0 = useMemo(() => timelineOrigin(now), [now]);

  const { railPx, rowPx, laneW, ppm } = guideMetrics(width);
  // `gap` = the raw-dp space between adjacent cells; chrome-scale it so it stays proportional to the (width-scaled)
  // cells on Android TV's 960dp space — else it reads as too-wide gaps there.
  const lane = useMemo<Lane>(() => ({ T0, ppm, laneW, gap: cs(6) }), [T0, ppm, laneW]);
  const minsFrom = useCallback((iso: string | Date) => ((typeof iso === "string" ? new Date(iso).getTime() : iso.getTime()) - T0.getTime()) / MIN, [T0]);
  const laneX = useCallback((iso: string | Date) => minsFrom(iso) * ppm, [minsFrom, ppm]);
  const nowMins = minsFrom(now);

  // Sidebar lens + package list.
  const [lens, setLens] = useState<Lens>({ type: "all" });
  const { data: pkgData } = usePackages();
  const sidebarItems = useMemo(() => buildSidebarItems(pkgData?.packages ?? [], lens, tk), [pkgData, lens, tk]);
  // The zone machine — grid ↔ rail ↔ sidebar, ported from tv-web's aurora-grid. Both touch and the
  // D-pad dispatcher drive this same state (sidebar expanded ⇔ zone === "sidebar").
  const [zone, setZone] = useState<"grid" | "rail" | "sidebar">("grid");
  const [sidebarSel, setSidebarSel] = useState(0);
  const sidebarExpanded = zone === "sidebar";
  const player = usePlayer();
  // The native rows (the default on Android TV) or the FlashList of React Native rows (everywhere else, and the fallback): see `useGuideRenderer`.
  const nativeRows = useGuideRenderer().renderer === "native";

  // Recents/favorites lenses filter the channel list (favorites via the passed set). These are the raw channel objects
  // from `useGuide`, which the native rows key their lineup on.
  const lensChannels = useMemo(() => {
    const inLens = (c: GuideGridChannel): boolean =>
      lens.type === "all"
        ? true
        : lens.type === "packages"
          ? !!c.package && lens.ids.includes(c.package.id)
          : lens.type === "favorites"
            ? favoriteIds.has(c.id)
            : true; // recents handled server-side elsewhere; kept simple here
    return rawChannels.filter(inLens);
  }, [rawChannels, lens, favoriteIds]);
  // Cull each channel's programs to what's actually on the visible grid — within the window AND wide
  // enough to render (not a rail-edge sliver) — at the SOURCE, matching tv-web (§7.1). This is what
  // makes the rows cheap: otherwise every row maps the whole day's back-buffer on EVERY keypress (the
  // guide lag), and `fp` could land on a hidden program. `isVisible` is this filter's own arithmetic, unchanged (its gap is
  // SOURCE_CULL_GAP, not the Row's `cs(6)`).
  const channels = useMemo(
    () => lensChannels.map((c): GuideGridChannel => ({ ...c, programs: c.programs.filter((p) => isVisible(p, lane)) })),
    [lensChannels, lane],
  );

  const [fc, setFc] = useState(0);
  const [fp, setFp] = useState(0);
  useEffect(() => {
    setFc(0);
    setFp(liveProgramIndex(channels[0]?.programs ?? [], now.getTime()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens]);

  const focusedChannel = channels[fc];
  const focusedProgram = focusedChannel?.programs[fp];

  const activateSidebar = (index: number) => {
    const item = sidebarItems[index];
    if (!item) return;
    setSidebarSel(index);
    if (item.kind === "settings") return onSettings();
    if (item.kind === "account") return onAccount();
    if (item.lens) {
      const next: Lens = item.lens.type !== "all" && lensEquals(item.lens, lens) ? { type: "all" } : item.lens;
      setLens(next);
      setZone("grid");
    }
  };

  // The sidebar's two handlers never change identity, so a D-pad step in the grid leaves the sidebar alone (it is memoized): the first reads the
  // latest `activateSidebar` through a ref, the second only sets state.
  const activateSidebarRef = useRef(activateSidebar);
  activateSidebarRef.current = activateSidebar;
  const onSidebarActivate = useCallback((index: number) => activateSidebarRef.current(index), []);
  const onSidebarExpand = useCallback(() => {
    setZone("sidebar");
    setSidebarSel(0);
  }, []);

  // Refs mirroring the live zone/selection + the callbacks, so onRailTap/onProgramTap can be STABLE
  // (`useCallback([])`). That stability is what lets `memo(Row)` skip re-rendering the unchanged rows on
  // every keypress — otherwise these close over fc/fp/zone/channels and change every navigation, defeating
  // the memo. Reading the latest via refs is also correct for an async tap (no stale closure).
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const fcRef = useRef(fc);
  fcRef.current = fc;
  const fpRef = useRef(fp);
  fpRef.current = fp;
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const onTuneRef = useRef(onTune);
  onTuneRef.current = onTune;
  const onToggleFavoriteRef = useRef(onToggleFavorite);
  onToggleFavoriteRef.current = onToggleFavorite;

  // Touch: tap to focus, tap the already-focused thing to activate — the same intent D-pad expresses
  // with move + OK, on the same zone/fc/fp state. Stable (refs above) so Row can be memoized.
  const onProgramTap = useCallback((index: number, pi: number) => {
    if (zoneRef.current === "grid" && index === fcRef.current && fpRef.current === pi) {
      const ch = channelsRef.current[index];
      if (ch) onTuneRef.current(ch.id);
      return;
    }
    setZone("grid");
    setFc(index);
    setFp(pi);
  }, []);
  const onRailTap = useCallback((index: number) => {
    if (zoneRef.current === "rail" && index === fcRef.current) {
      const ch = channelsRef.current[index];
      if (ch) onToggleFavoriteRef.current(ch.id);
      return;
    }
    setZone("rail");
    setFc(index);
  }, []);

  // D-pad — the aurora-grid zone machine, ported. Drives the exact same state as touch.
  // tvOS root exit (Apple HIG), the analogue of tv-web's platformBack: when the guide is the FOCUSED
  // screen and sitting at its resting root (grid zone, nothing playing/docked), disable the Menu key so
  // Back leaves the app to the Home screen. Any in-app back state re-enables it so Back navigates
  // in-app: a rail/sidebar zone, a docked (mini) or full-screen player (`layout !== "off"`), or a pushed
  // Settings screen (the guide blurs → `screenFocused` false). No-op off tvOS (`setBackExitsApp`).
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );
  useEffect(() => {
    setBackExitsApp(screenFocused && zone === "grid" && player.layout === "off");
  }, [screenFocused, zone, player.layout]);

  useKeyLayer({
    id: "guide",
    priority: LAYER.BASE,
    // Off the stack while the full-screen player is up (player-chrome owns the keys then). Matches
    // tv-web's `active: player.layout !== "full"`.
    active: player.layout !== "full",
    onKey(e) {
      // Hold-OK jumps straight to the docked mini from anywhere in the guide — the Siri-remote analogue
      // of tv-web's GREEN shortcut (same destination as ▲ from the top row, minus the travel).
      if (e.key === "okLong" && player.layout === "mini" && !player.miniFocused) {
        player.focusMini();
        return true;
      }
      if (zone === "sidebar") {
        if (e.key === "back" || e.key === "right") setZone("grid");
        else if (e.key === "up") setSidebarSel((s) => Math.max(0, s - 1));
        else if (e.key === "down") setSidebarSel((s) => Math.min(sidebarItems.length - 1, s + 1));
        else if (e.key === "ok") activateSidebar(sidebarSel);
        return true;
      }
      if (zone === "rail") {
        if (e.key === "left") { setZone("sidebar"); setSidebarSel(0); }
        else if (e.key === "back" || e.key === "right") setZone("grid");
        else if (e.key === "up") setFc((c) => Math.max(0, c - 1));
        else if (e.key === "down") setFc((c) => Math.min(channels.length - 1, c + 1));
        else if (e.key === "ok" && focusedChannel) onToggleFavorite(focusedChannel.id);
        return true;
      }
      // Mini feed focused → its two buttons own the keys. Handled INSIDE this one guide handler by the
      // active-zone check (tv-web's model), NOT a separate key layer. Back stops the feed; Down blurs
      // back to the grid; ◄/► move between Full-screen/Close; OK activates.
      if (player.miniFocused) {
        if (e.key === "back") player.stop();
        else if (e.key === "left") player.miniMove(-1);
        else if (e.key === "right") player.miniMove(1);
        else if (e.key === "ok") player.miniActivate();
        else if (e.key === "down") player.blurMini();
        return true;
      }
      // Back at the grid zone → stop a docked mini feed. At the true root (nothing playing) the Menu key
      // is disabled (see the root-exit effect above), so on tvOS Back exits to Home and never reaches
      // here; on the iPad (no hardware Back) this is a harmless no-op.
      if (e.key === "back") {
        if (player.layout === "mini") player.stop();
        return true;
      }
      const n = channels.length;
      if (!n) {
        if (e.key === "left") { setZone("sidebar"); setSidebarSel(0); return true; }
        return false;
      }
      switch (e.key) {
        case "right":
          setFp((p) => Math.min((focusedChannel?.programs.length ?? 1) - 1, p + 1));
          return true;
        case "left":
          if (fp === 0) setZone("rail");
          else setFp((p) => Math.max(0, p - 1));
          return true;
        case "down": {
          const nc = Math.min(n - 1, fc + 1);
          setFc(nc);
          setFp(liveProgramIndex(channels[nc]!.programs, now.getTime()));
          return true;
        }
        case "up": {
          // At the top row, Up docks into the mini feed if one's playing (tv-web parity — the featured
          // slot / mini sits above the channel list).
          if (fc === 0) {
            if (player.layout === "mini") player.focusMini();
            return true;
          }
          const nc = Math.max(0, fc - 1);
          setFc(nc);
          setFp(liveProgramIndex(channels[nc]!.programs, now.getTime()));
          return true;
        }
        case "ok":
          if (focusedChannel) onTune(focusedChannel.id);
          return true;
      }
      return false;
    },
  });

  const listRef = useRef<FlashListRef<GuideGridChannel>>(null);
  const scrollYRef = useRef(0);
  const listHRef = useRef(0);
  // The rows fell back from the native view to the FlashList (it failed, or the setting changed): the list opens where the native rows
  // were scrolled to (`NativeRows` writes that into `nativeScrollRef` as it renders), with the focused row still on screen, instead of back
  // at the first channel or with the focused row thrown to the top. The offset the list is taken to be at is held inside the list.
  const nativeScrollRef = useRef<NativeScroll>({ y: 0, h: 0 });
  const wasNativeRef = useRef(nativeRows);
  const listStartRef = useRef<number | undefined>(undefined);
  if (wasNativeRef.current !== nativeRows) {
    wasNativeRef.current = nativeRows;
    if (nativeRows) {
      listStartRef.current = undefined;
      scrollYRef.current = 0;
    } else {
      const start = classicHandOver(nativeScrollRef.current, fc, rowPx, channels.length);
      listStartRef.current = start.index;
      scrollYRef.current = start.offset;
      // The list measures itself (`onLayout`) only after its first frame, and a key press can come before that. Until it has, it is the native view's
      // height, so the follow rule below keeps the focused row where it is instead of putting it at the top (a list of no height) and the effect
      // has nothing to do on the render that hands over (the list opens with the focused row on screen).
      listHRef.current = start.listH;
    }
  }
  // Only the list that opens right after the switch starts at `fc`. Once the rows run out (a lens with no channels) the list
  // unmounts, and the next one starts at the top, where the focus is again.
  if (channels.length === 0) listStartRef.current = undefined;
  // Scroll the list only when the focused channel would be OFF-SCREEN (tv-web parity) — otherwise leave
  // it PUT, so moving up/down feels like you're travelling through the visible rows and the list only
  // scrolls once you hit the top/bottom edge (not the old "always re-center", which never felt like
  // scrolling). Rows are a fixed height (rowPx), so the visible band = [scrollY, scrollY + listHeight].
  // We predict the new offset after a programmatic scroll so rapid presses stay consistent. TV only —
  // iPad keeps native touch-scroll (this is a no-op there).
  useEffect(() => {
    if (!Platform.isTV || !channels.length || nativeRows) return; // the native rows follow focus themselves
    if (zone !== "grid" && zone !== "rail") return;
    const move = classicFollow(scrollYRef.current, fc, rowPx, listHRef.current);
    if (!move) return; // already fully visible → don't scroll.
    try {
      listRef.current?.scrollToIndex({ index: fc, animated: false, viewPosition: move.viewPosition });
      if (move.offset !== undefined) scrollYRef.current = move.offset;
    } catch {
      // index not measured yet / out of range — the next fc change re-tries.
    }
  }, [fc, zone, channels.length, rowPx, nativeRows]);

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: tk.bg }}>
      {/* A theme's repeating background (halftone dots, graph paper) sits behind everything; every plate that carries text covers it. */}
      {tk.patterns.bg && (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
          <PatternFill pattern={tk.patterns.bg} u={vw(1)} />
        </View>
      )}
      {/* The guide column — the layout reserves only the sliver width; the sidebar overlays it. Must use
          the SAME chrome-scaled width as the sidebar (cs), or the content sits offset by the old width. */}
      <View style={{ width: cs(SIDEBAR_SLIVER_W), flexShrink: 0 }} />
      <View style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {channels.length > 0 && focusedChannel && focusedProgram ? (
          <FeaturedPanel channel={focusedChannel} program={focusedProgram} now={now} accent={rowAccent(tk, channelTint(focusedChannel) ?? accentOf(fc), fc)} vw={vw} onTune={() => onTune(focusedChannel.id)} />
        ) : (
          <View style={{ height: vw(600) }} />
        )}

        {channels.length > 0 && <TimeHeaderMemo T0={T0} railPx={railPx} ppm={ppm} laneX={laneX} vw={vw} />}

        <View style={{ position: "relative", flex: 1 }}>
          {channels.length === 0 ? (
            <GuideGhost
              railPx={railPx}
              rowPx={rowPx}
              laneW={laneW}
              vw={vw}
              message={lens.type === "favorites" ? "No favorites yet" : lens.type === "packages" ? "No channels in this filter" : "No channels yet"}
              sub={lens.type === "favorites" ? "Highlight a channel and add it to your favorites." : lens.type === "packages" ? "Try another filter, or open the sidebar to clear it." : "Once channels are set up on your server, they'll appear here."}
            />
          ) : nativeRows ? (
            <NativeRows
              channels={lensChannels}
              favoriteIds={favoriteIds}
              fc={fc}
              focusProgramId={focusedProgram?.id}
              zone={zone}
              miniFocused={player.miniFocused}
              rowPx={rowPx}
              railPx={railPx}
              laneW={laneW}
              ppm={ppm}
              originMs={T0.getTime()}
              nowMs={now.getTime()}
              gap={lane.gap}
              vw={vw}
              scrollOut={nativeScrollRef}
              onRailTap={onRailTap}
              onProgramTap={onProgramTap}
              onError={reportNativeGuideError}
            />
          ) : (
            <FlashList
              ref={listRef}
              data={channels}
              initialScrollIndex={listStartRef.current}
              keyExtractor={(c) => c.id}
              extraData={{ fc, fp, zone, mf: player.miniFocused }}
              // TV: kill the list's own scroll so the remote's swipe surfaces as a discrete swipeUp/Down
              // event (→ one zone step) instead of the OS smooth-scrolling the list underneath us. iPad
              // keeps native touch-scroll.
              scrollEnabled={!Platform.isTV}
              onScroll={(e) => (scrollYRef.current = e.nativeEvent.contentOffset.y)}
              onLayout={(e) => (listHRef.current = e.nativeEvent.layout.height)}
              scrollEventThrottle={16}
              renderItem={({ item, index }) => (
                <RowMemo
                  channel={item}
                  accent={rowAccent(tk, channelTint(item) ?? accentOf(index), index)}
                  focused={index === fc && zone !== "sidebar" && !player.miniFocused}
                  railFocused={zone === "rail" && index === fc && !player.miniFocused}
                  focusedProgramId={zone === "grid" && index === fc && !player.miniFocused ? focusedProgram?.id : undefined}
                  favorited={favoriteIds.has(item.id)}
                  index={index}
                  onRailTap={onRailTap}
                  onProgramTap={onProgramTap}
                  now={now}
                  rowPx={rowPx}
                  railPx={railPx}
                  lane={lane}
                  nowX={laneX(now)}
                  vw={vw}
                />
              )}
            />
          )}

          {/* now-marker, capping the grid at the current time: a triangle (or a square, in a theme that asks for one). */}
          {channels.length > 0 && nowMins >= 0 && nowMins <= WINDOW_MIN && <NowMarker tk={tk} vw={vw} left={railPx + laneX(now)} />}
        </View>
      </View>

      {/* Scrim behind the expanded sidebar — tap to collapse. */}
      {sidebarExpanded && (
        <Pressable onPress={() => setZone("grid")} focusable={!Platform.isTV} style={{ position: "absolute", inset: 0, backgroundColor: tk.scrim, zIndex: 24 }} />
      )}

      <GuideSidebar
        items={sidebarItems}
        expanded={sidebarExpanded}
        focused={zone === "sidebar"}
        sel={sidebarSel}
        lens={lens}
        onActivate={onSidebarActivate}
        onExpand={onSidebarExpand}
      />

      {/* A theme's paper grain, over everything and at low alpha, so it is never behind a word. */}
      {tk.patterns.overlay && (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 50 }}>
          <GrainFill grain={tk.patterns.overlay} u={vw(1)} />
        </View>
      )}
    </View>
  );
}

/**
 * The now marker above the first row, `left` dp from the guide column's edge (its centre): a triangle pointing down, or a square. A theme
 * that misregisters its circles draws a second triangle, offset, in its second ink, which is moved but not blended: a blended view puts
 * its parent in an offscreen layer, and this one's parent is the container of every row (see `misBlend`).
 */
export function NowMarker({ tk, vw, left }: { tk: GuideTokens; vw: (px: number) => number; left: number }) {
  if (tk.headerStyle?.markerShape === "square") {
    return <View pointerEvents="none" style={{ position: "absolute", top: -vw(18), left: left - vw(9), width: vw(18), height: vw(18), backgroundColor: tk.now, zIndex: 7 }} />;
  }
  const triangle = (color: string, extra?: ViewStyle): ViewStyle => ({
    position: "absolute",
    top: -vw(14),
    left: left - vw(9),
    width: 0,
    height: 0,
    borderLeftWidth: vw(9),
    borderRightWidth: vw(9),
    borderTopWidth: vw(14),
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: color,
    zIndex: 7,
    ...extra,
  });
  const mis = tk.misregister?.shapes.includes("circle") ? tk.misregister : null;
  return (
    <>
      {mis && <View pointerEvents="none" style={triangle(mis.color, misShapeStyle(mis, vw, "marker"))} />}
      <View pointerEvents="none" style={triangle(tk.now)} />
    </>
  );
}

/**
 * The time header: the date at the rail's edge and a time every 30 minutes along the lane. A theme can give it a plate, a rule
 * under it, a ruler of 5 minute ticks, and set its text in its own faces (`header` for the times, `day` for the date), misregistered.
 * With none of that it is the bare row of text it has always been.
 */
export function TimeHeader({ T0, railPx, ppm, laneX, vw }: { T0: Date; railPx: number; ppm: number; laneX: (d: Date) => number; vw: (px: number) => number }) {
  const tk = useGuideTokens();
  const hs = tk.headerStyle;
  const ticks = Array.from({ length: Math.ceil(WINDOW_MIN / 30) + 1 }, (_, i) => new Date(T0.getTime() + i * 30 * MIN));
  const mis = tk.misregister?.text.includes("header") ? tk.misregister : null;
  const day = roleText(tk, "day", vw(32));
  const time = roleText(tk, "header", vw(32));
  // A theme that sets the date smaller, or plates the header, keeps it on one line within the rail's width.
  const fit = hs !== null || tk.typeStyle.day.scale !== 1;
  const row = (
    <View style={{ position: "relative", height: vw(52), flexShrink: 0, ...(hs ? {} : { marginTop: vw(56), marginBottom: vw(20) }) }}>
      <MisText mis={mis} vw={vw} under={hs?.bg ?? tk.bg} face={day} color={tk.headerDay} fit={fit} box={{ position: "absolute", left: vw(40), top: vw(6), ...(fit ? { maxWidth: Math.max(1, railPx - vw(52)) } : {}) }}>
        {fmtDay(T0)}
      </MisText>
      <View style={{ position: "absolute", left: railPx, right: 0, top: 0, bottom: 0 }}>
        <MisLabels mis={mis} vw={vw} face={time} color={tk.headerTick} under={hs?.bg ?? tk.bg} labels={ticks.map((t) => ({ left: laneX(t), top: vw(6), text: fmtTime(t) }))} />
      </View>
    </View>
  );
  if (!hs) return row;
  return (
    <View style={{ position: "relative", flexShrink: 0, paddingTop: vw(56), paddingBottom: vw(20), backgroundColor: hs.bg ?? undefined }}>
      {row}
      {hs.ruler && (
        <View pointerEvents="none" style={{ position: "absolute", left: railPx, bottom: 0, width: Math.max(1, ppm * WINDOW_MIN), height: vw(hs.ruler.majorH) }}>
          <Ruler width={ppm * WINDOW_MIN} height={vw(hs.ruler.majorH)} windowMin={WINDOW_MIN} ppm={ppm} t={hs.ruler} u={vw(1)} />
        </View>
      )}
      {hs.rule && <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: vw(hs.rule.w), backgroundColor: hs.rule.color }} />}
    </View>
  );
}

/**
 * The time header holds still while the focus moves (its props are memoized above: the origin, the lane's scale and the two scalers), so a D-pad
 * step has no reason to run it again. Its own theme and layout reads (`useGuideTokens`, the window) still re-render it when those change.
 */
const TimeHeaderMemo = memo(TimeHeader);

// Memoized: with stable props (the `now`/laneX/vw memos + the ref-backed onRailTap/onProgramTap), only the
// rows whose focus/favorited actually changed re-render on navigation — not every visible row.
export const RowMemo = memo(Row);

/**
 * A custom typeface gets a line height of 1.2 em for cell text; the system font keeps its own. Only text laid out in a row of
 * its own gets one: on Android a line height under 1.2 em on a short, absolutely placed line (a time tick, a channel number) made
 * Bangers wrap at the space and lose its tail.
 */
const usesCustomFace = (tk: GuideTokens) => tk.typeStyle.display !== null || tk.typeStyle.text !== null;

export function Row({
  channel,
  accent,
  focused,
  railFocused,
  focusedProgramId,
  favorited,
  index,
  onRailTap,
  onProgramTap,
  now,
  rowPx,
  railPx,
  lane,
  nowX,
  vw,
  sample,
}: {
  channel: GuideGridChannel;
  accent: string;
  focused: boolean;
  railFocused: boolean;
  focusedProgramId?: string;
  favorited: boolean;
  index: number;
  onRailTap: (index: number) => void;
  onProgramTap: (index: number, programIndex: number) => void;
  now: Date;
  rowPx: number;
  railPx: number;
  lane: Lane;
  nowX: number;
  vw: (px: number) => number;
  /** The settings preview: sample artwork (the theme's placeholder) is drawn without asking the server for anything, whatever the Program art setting says. */
  sample?: boolean;
}) {
  const tk = useGuideTokens();
  const { art: artPref, marks } = useGuidePrefs();
  const art = sample || artPref === "on";
  const Icon = channelIcon(channel.icon ?? channel.package?.icon);
  const st = tk.circleStyle;
  // The rail's box (and the logo's, which keeps its size) is the circle's size before a theme's `scale`.
  const box = vw(64 * FEATURE_SCALE);
  const circle = box * st.scale;
  // With Channel marks set to Logos, a channel that has a logo shows it in place of its icon circle (until the focused rail
  // turns the circle into the favorite heart); a logo that fails to load leaves the circle.
  const logoSrc = marks === "logos" ? logoSource(channel.logo, getServerUrl()) : null;
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const showLogo = logoSrc !== null && failedLogo !== logoSrc && !railFocused;
  // The accent as a mark (glyph, bars, circle border). Tints below stay the raw accent at their alphas.
  const fg = accentFg(tk, accent);
  const lf = tk.liveFill;
  const numeral = tk.railLayout === "numeral";
  // An oversized channel number shrinks to the room the rail leaves it, on one line, rather than wrapping (the rail is narrower on a TV than at design width).
  const big = numeral || tk.typeStyle.number.scale > 1;
  const misNum = tk.misregister?.text.includes("number") ? tk.misregister : null;
  const misCircle = tk.misregister?.shapes.includes("circle") ? tk.misregister : null;
  const rf = focused ? tk.railFocus : null;
  const cc = circleColors(tk, { accent, fg, rowFocused: focused, featured: false, under: railGround(tk) });
  // The circle's rim: the focus ring while the rail is focused, else the theme's own (a hairline for Aurora).
  const rimW = railFocused ? line(tk.ringW) : st.borderW === null ? line(1) : vw(st.borderW);
  const rimColor = railFocused ? tk.ring : cc.border;
  const radius = st.radius >= 0.5 ? circle / 2 : st.radius * circle;
  const glyph = vw(34 * FEATURE_SCALE) * st.scale;
  const stroke = tk.glyphStroke === 2 ? {} : { strokeWidth: tk.glyphStroke };
  const numberFace = roleText(tk, "number", vw(34));
  const nameFace = roleText(tk, "name", vw(23));

  const badge = favorited && !railFocused && (
    <View style={{ position: "absolute", right: -vw(4), bottom: -vw(4) }}>
      {tk.favStroke ? (
        <Heart size={vw(22)} color={tk.favStroke.color} fill={tk.fav} strokeWidth={(tk.favStroke.w / 22) * 24} />
      ) : (
        <Heart size={vw(22)} color={tk.fav} fill={tk.fav} />
      )}
    </View>
  );
  const iconCircle = (
    <View
      style={{
        width: circle,
        height: circle,
        borderRadius: radius,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: cc.fill,
        borderWidth: misCircle ? 0 : rimW,
        borderColor: rimColor,
      }}
    >
      {railFocused ? (
        <Heart size={glyph} color={favorited ? tk.fav : tk.heartOff} fill={favorited ? tk.fav : "none"} {...stroke} />
      ) : (
        <Icon size={glyph} color={cc.glyph} {...stroke} />
      )}
      {misCircle && rimW > 0 && (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: radius, borderWidth: rimW, borderColor: rimColor, ...misShapeStyle(misCircle, vw, "rim") }} />
      )}
      {st.marks && <CircleMarks d={circle} m={st.marks} u={vw(1)} color={rimColor} />}
      {badge}
    </View>
  );
  const logo = (
    <View style={{ flex: 1, height: box, ...(numeral ? { marginLeft: vw(8) } : { marginRight: vw(8) }) }}>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: cs(6),
          backgroundColor: tk.logoPlate,
          padding: hasLogoPlate(tk.logoPlate) ? vw(4) : 0,
          overflow: "hidden",
        }}
      >
        <Image source={{ uri: logoSrc! }} resizeMode="contain" onError={() => setFailedLogo(logoSrc)} style={{ flex: 1 }} />
      </View>
      {badge}
    </View>
  );
  const mark = showLogo ? logo : iconCircle;
  const number = (
    <MisText mis={misNum} vw={vw} face={numberFace} color={focused ? (rf?.number ?? tk.numberFocused) : tk.number} fit={big} box={big ? { flexShrink: 1, minWidth: 0 } : undefined}>
      {channel.number}
    </MisText>
  );

  return (
    <View style={{ height: rowPx, flexDirection: "row", borderTopWidth: tk.rowBorderW === null ? 1 : vw(tk.rowBorderW), borderTopColor: tk.rowBorder }}>
      {/* Rail — tap to focus; tap again (rail-focused) toggles favorite. The circle mirrors tv-web:
          when rail-focused it becomes the favorite heart (filled red if favorited, else outline). */}
      <Pressable
        onPress={() => onRailTap(index)}
        focusable={!Platform.isTV}
        style={{
          width: railPx,
          paddingVertical: vw(18),
          paddingHorizontal: vw(20),
          justifyContent: "space-between",
          backgroundColor: railBackground(tk, accent, focused),
          ...(tk.railDivider ? { borderRightWidth: vw(tk.railDivider.w), borderRightColor: tk.railDivider.color } : {}),
        }}
      >
        {focused && tk.railBar.w > 0 && (
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: vw(tk.railBar.w), backgroundColor: tk.railBar.color ?? fg, ...(tk.railBar.r > 0 ? { borderRadius: vw(tk.railBar.r) } : {}) }} />
        )}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", ...(numeral ? { gap: vw(8) } : {}) }}>
          {numeral ? number : mark}
          {numeral ? mark : number}
        </View>
        <Text numberOfLines={2} style={{ ...nameFace, color: focused ? (rf?.name ?? tk.name) : tk.name, lineHeight: nameFace.fontSize * 1.2 }}>
          {channel.name}
        </Text>
      </Pressable>

      {/* Lane */}
      <View style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {channel.programs.map((p, pi) => {
          const box = cellBox(p, lane);
          if (!box) return null;
          const { left, width: cw } = box;
          const selected = p.id === focusedProgramId;
          const startMs = new Date(p.startsAt).getTime();
          const live = now.getTime() >= startMs && now.getTime() < startMs + p.durationSeconds * 1000;
          const fillPct = liveFill(nowX, left, cw);
          const fillA = lf.mode === "tint" ? hexA(accent, lf.elapsed) : lf.elapsed;
          const fillB = lf.mode === "tint" ? hexA(accent, lf.remain) : lf.remain;
          // How far the programme's real start lies left of the cell's edge, when the cell is clamped against the rail.
          const phase = left - ((startMs - lane.T0.getTime()) / MIN) * lane.ppm;
          return (
            <ProgramCell
              key={p.id}
              program={p}
              programIndex={pi}
              channelId={channel.id}
              index={index}
              left={left}
              width={cw}
              phase={phase}
              ppm={lane.ppm}
              selected={selected}
              live={live}
              fillA={fillA}
              fillB={fillB}
              fillPct={fillPct}
              fg={fg}
              tk={tk}
              art={art}
              sample={!!sample}
              rowPx={rowPx}
              vw={vw}
              onProgramTap={onProgramTap}
            />
          );
        })}
      </View>
    </View>
  );
}

type ProgramCellProps = {
  program: GuideGridProgram;
  programIndex: number;
  channelId: string;
  /** The row's index in the lineup. */
  index: number;
  /** The cell's box in the lane (dp). */
  left: number;
  width: number;
  /** dp the programme's real start lies left of `left` (a cell clamped against the rail), and dp per minute along the lane. */
  phase: number;
  ppm: number;
  selected: boolean;
  live: boolean;
  /** The on-now fill's colors, left and right of the now line, and where the line falls (0..1). */
  fillA: string;
  fillB: string;
  fillPct: number;
  /** The row's accent as a mark (the live bar). */
  fg: string;
  tk: GuideTokens;
  /** Program art is on: the cell shows its artwork when it has one. */
  art: boolean;
  /** The settings preview: a program with art shows the theme's placeholder in its place and asks the server for nothing. */
  sample: boolean;
  rowPx: number;
  vw: (px: number) => number;
  onProgramTap: (index: number, programIndex: number) => void;
};

/**
 * One program's cell. With program art on, the program's artwork (its landscape `art`, else its `thumb`) fills the cell, centre
 * cropped, under a scrim and the title and sub-line in the theme's art text colors, or, in a theme that keeps its words on a plate,
 * sits in a framed strip beside the text. The request is the server's image route at the cell's size rounded up to a 64 px step,
 * the same URL the native rows ask for. Until the image has loaded the theme's placeholder gradient is behind it. A cell with no
 * artwork, or whose image failed to load, is a plain cell. With art off the cell is exactly what it was before art existed.
 *
 * A theme can add to the plain cell: a hard shadow under it (the body shrinks by the offset, so the box does not change), rings
 * and a halo around the selected one, a status word (a NOW tag, a NOW! burst, a kicker line), a progress bar, band or
 * dimension line, a column rule, a highlight and its own text colors per state. Whatever has to be drawn outside the body (shadow,
 * rings) is drawn in a frame around it, so the body can still clip its own contents.
 */
function ProgramCell({ program: p, programIndex: pi, channelId, index, left, width: cw, phase, ppm, selected, live, fillA, fillB, fillPct, fg, tk, art, sample, rowPx, vw, onProgramTap }: ProgramCellProps) {
  const u = vw(1);
  const fs = tk.fontScale;
  const cellH = rowPx - vw(12);
  const sampleArt = sample && !!p.guide.art;
  const base = art && !sample ? imageUrl(channelId, programArtPath(p.guide)) : null;
  const src = base ? artUrl(base, artBox(cw, cellH, PixelRatio.get())) : null;
  // The image that failed to load, so a changed URL (another size) gets a fresh try; and the one that has loaded.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const showArt = sampleArt || (src !== null && failedSrc !== src);
  const side = showArt && tk.art.layout === "side";
  const artFull = showArt && !side;

  const surface = cellSurface(tk, { selected, live });
  const bw = selected ? line(tk.ringW) : ln(tk.cellBorderW);
  const radius = cs(tk.cellRadius);
  const shadow = cellShadow(tk, selected);
  const inset = shadowInset(shadow);
  const bodyW = cw - vw(inset.dx);
  const bodyH = cellH - vw(inset.dy);
  const rings = selected ? ringLayers(tk, fg, { vw, ln }) : [];
  const misRing = selected && tk.misregister?.shapes.includes("ring") ? tk.misregister : null;
  // The same views whatever the cell's state (see `themeFramesCells`): a focus change updates the cell in place.
  const framed = themeFramesCells(tk);
  const innerW = bodyW - 2 * bw;

  const colors = cellTextColors(tk, { selected, live, artFull });
  const sl = tk.statusLabel;
  const plate = sl.mode === "plate" && live && labelFits(sl, cw / u) ? sl : null;
  const burst = sl.mode === "burst" && live && labelFits(sl, cw / u) ? sl : null;
  const kickerLabel = sl.mode === "kicker" ? sl : null;
  // The kicker line is kept only if it fits the cell's text width whole (never cut to "9:0..."): its own layout says so, and a cell
  // without it is laid out like a plain one. It stays mounted, out of the flow, to be measured again as the cell changes size. The
  // native rows apply the same rule (`kickerFits` in packages/native-guide).
  const [kickerCut, setKickerCut] = useState(false);
  const kicker = kickerLabel && !kickerCut ? kickerLabel : null;
  const custom = usesCustomFace(tk);
  const lines = (f: ReturnType<typeof roleText>) => (custom ? { ...f, lineHeight: f.fontSize * 1.2 } : f);
  const misTitle = tk.misregister?.text.includes("title") ? tk.misregister : null;
  const stripW = side ? tk.art.sideFrac * innerW : 0;
  const padRight = vw(20) + stripW + (burst ? vw(burst.size + 6) : 0);
  const pr = tk.progress;
  const lb = tk.liveBar;
  const fillTransparent = fillA === "transparent" && fillB === "transparent";

  const placeholder = tk.art.placeholder;
  const placeholderGradient = (w: number, h: number) => {
    const pts = gradientPoints(placeholder.angle, w, h);
    const colors = placeholder.stops.map((s) => s[0]) as unknown as readonly [string, string, ...string[]];
    const locations = placeholder.stops.map((s) => s[1]) as unknown as readonly [number, number, ...number[]];
    return <LinearGradient colors={colors} locations={locations} start={pts.start} end={pts.end} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} />;
  };
  const picture = src !== null && (
    <Image source={{ uri: src }} resizeMode="cover" resizeMethod="resize" onLoad={() => setLoadedSrc(src)} onError={() => setFailedSrc(src)} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} />
  );
  const pending = sampleArt || loadedSrc !== src;

  const content = (
    <>
      {artFull && (
        <>
          {pending && placeholderGradient(innerW, bodyH - 2 * bw)}
          {picture}
          <LinearGradient colors={[tk.artScrim[0], tk.artScrim[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: "absolute", inset: 0 }} />
        </>
      )}
      {side && (
        <View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: stripW, borderLeftWidth: vw(tk.art.frameW), borderLeftColor: tk.art.frameColor, overflow: "hidden" }}>
          {pending && placeholderGradient(stripW, bodyH - 2 * bw)}
          {picture}
        </View>
      )}
      {live && !fillTransparent && (
        <LinearGradient
          colors={[fillA, fillA, fillB, fillB]}
          locations={[0, fillPct, fillPct, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ position: "absolute", inset: 0 }}
        />
      )}
      {live && lb.w > 0 && (
        <View style={{ position: "absolute", left: vw(lb.x), top: vw(lb.inset), bottom: vw(lb.inset), width: ln(lb.w), borderRadius: ln(lb.r), backgroundColor: lb.color ?? fg }} />
      )}
      {tk.cellRule && <View style={{ position: "absolute", left: 0, top: vw(tk.cellRule.inset), bottom: vw(tk.cellRule.inset), width: vw(tk.cellRule.w), backgroundColor: tk.cellRule.color }} />}
      {tk.highlight && !selected && <View style={{ position: "absolute", left: radius, right: radius, top: 0, height: vw(tk.highlight.w), backgroundColor: tk.highlight.color }} />}
      <View style={{ paddingTop: vw(kicker ? 12 : 20), ...(padRight === vw(20) ? { paddingHorizontal: vw(20) } : { paddingLeft: vw(20), paddingRight: padRight }) }}>
        {kickerLabel && (
          <Text
            numberOfLines={1}
            onTextLayout={(e) => {
              const cut = lineWasCut(e.nativeEvent.lines);
              if (cut !== kickerCut) setKickerCut(cut);
            }}
            style={{
              ...faceText(tk, "text", vw(20) * fs, { weight: FIXED_WEIGHTS.status.weight, track: 0.14, upper: true }),
              lineHeight: vw(20) * fs * 1.1,
              color: selected && tk.focusText ? tk.focusText.kicker : kickerLabel.color,
              ...(kickerCut ? { position: "absolute", left: vw(20), right: padRight, top: 0, opacity: 0 } : { marginBottom: vw(4) }),
            }}
          >
            {live ? kickerLabel.live : fmtTime(new Date(p.startsAt))}
          </Text>
        )}
        <MisText mis={misTitle} vw={vw} face={lines(roleText(tk, "title", vw(34)))} color={colors.title} numberOfLines={1}>
          {p.guide.showTitle ?? p.guide.title}
        </MisText>
        {plate ? (
          <View style={{ marginTop: vw(12), flexDirection: "row", alignItems: "center" }}>
            <View style={{ backgroundColor: plate.bg, paddingVertical: vw(1), paddingHorizontal: vw(9), marginRight: vw(10) }}>
              <Text style={{ ...faceText(tk, "text", vw(22) * fs, { weight: FIXED_WEIGHTS.status.weight, track: 0.06 }), lineHeight: vw(22) * fs * 1.25, color: plate.fg }}>{plate.text}</Text>
            </View>
            <Text numberOfLines={1} style={{ flexShrink: 1, ...lines(roleText(tk, "sub", vw(26))), color: colors.sub }}>
              {subLine(p.guide)}
            </Text>
          </View>
        ) : (
          <Text numberOfLines={1} style={{ marginTop: vw(12), ...lines(roleText(tk, "sub", vw(26))), color: colors.sub }}>
            {subLine(p.guide)}
          </Text>
        )}
      </View>
      {live && pr.style === "ticks" && pr.ticks && (
        <View pointerEvents="none" style={{ position: "absolute", left: vw(pr.inset), bottom: vw(pr.bottom), width: Math.max(1, innerW - 2 * vw(pr.inset)), height: vw(pr.h) }}>
          <DimensionLine width={Math.max(1, innerW - 2 * vw(pr.inset))} height={vw(pr.h)} pct={fillPct} step={pr.ticks.every * ppm} phase={phase} t={pr.ticks} u={u} nowColor={tk.now} />
        </View>
      )}
      {live && (pr.style === "bar" || pr.style === "band") && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: vw(pr.inset),
            right: vw(pr.inset),
            bottom: vw(pr.bottom),
            height: vw(pr.h),
            borderRadius: vw(pr.r),
            backgroundColor: pr.track,
            overflow: "hidden",
            ...(pr.trackBorder ? (pr.trackBorder.sides === "top" ? { borderTopWidth: vw(pr.trackBorder.w), borderTopColor: pr.trackBorder.color } : { borderWidth: vw(pr.trackBorder.w), borderColor: pr.trackBorder.color }) : {}),
          }}
        >
          {pr.remainPattern && (
            <View style={{ position: "absolute", left: `${fillPct * 100}%`, right: 0, top: 0, bottom: 0 }}>
              <PatternFill pattern={pr.remainPattern} u={u} />
            </View>
          )}
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fillPct * 100}%`, borderRadius: vw(pr.r), backgroundColor: pr.fill === "accent" ? fg : pr.fill }} />
        </View>
      )}
      {burst && <Burst label={burst} size={vw(burst.size)} vw={vw} face={faceText(tk, "display", 0)} />}
    </>
  );

  const bodyStyle = {
    borderRadius: radius,
    overflow: "hidden" as const,
    borderWidth: bw,
    borderColor: surface.borderColor,
    ...(surface.dashed ? { borderStyle: "dashed" as const } : {}),
    backgroundColor: surface.bg,
  };

  if (!framed) {
    return (
      <Pressable
        onPress={() => onProgramTap(index, pi)}
        focusable={!Platform.isTV}
        style={{ position: "absolute", top: vw(6), left, width: cw, height: cellH, ...bodyStyle, zIndex: selected ? 4 : 1 }}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={() => onProgramTap(index, pi)} focusable={!Platform.isTV} style={{ position: "absolute", top: vw(6), left, width: cw, height: cellH, zIndex: selected ? 4 : 1 }}>
      {shadow?.steps.map((s, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: vw(s.dx - s.grow),
            top: vw(s.dy - s.grow),
            width: bodyW + 2 * vw(s.grow),
            height: bodyH + 2 * vw(s.grow),
            borderRadius: radius + vw(s.grow),
            backgroundColor: hexA(s.color, s.a),
            ...(s.stroke ? { borderWidth: vw(s.stroke.w), borderColor: s.stroke.color } : {}),
          }}
        />
      ))}
      <View style={{ position: "absolute", left: 0, top: 0, width: bodyW, height: bodyH, ...bodyStyle }}>{content}</View>
      {rings.map((r, i) => (
        <View
          key={`r${i}`}
          pointerEvents="none"
          style={{ position: "absolute", left: -r.out, top: -r.out, width: bodyW + 2 * r.out, height: bodyH + 2 * r.out, borderRadius: radius + r.out, borderWidth: r.w, borderColor: r.color, ...(r.dashed ? { borderStyle: "dashed" } : {}) }}
        />
      ))}
      {misRing && (
        <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: bodyW, height: bodyH, borderRadius: radius, borderWidth: bw, borderColor: misRing.color, ...misShapeStyle(misRing, vw, "ring") }} />
      )}
    </Pressable>
  );
}

function Badge({ label, colors, textColor, fv, tk }: { label: string; colors: readonly [string, string]; textColor: string; fv: (px: number) => number; tk: GuideTokens }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: cs(tk.cellRadius), paddingVertical: fv(6), paddingHorizontal: fv(16) }}>
      <Text style={{ ...faceText(tk, FIXED_WEIGHTS.status.face, fv(30), { weight: FIXED_WEIGHTS.status.weight }), color: textColor }}>{label}</Text>
    </LinearGradient>
  );
}

/**
 * The featured panel's text: the focused program's channel, title, badges, details and progress, in the theme's colors and faces. A
 * theme can put it on a bordered plate with a hard shadow, set the title and channel in its display face, misregister them, and draw
 * the progress as a bar in its own style or a dimension line. `FeaturedPanel` adds the tap target and the mini-feed slot around it, and the
 * settings preview shows this part alone.
 */
export function FeaturedBody({ channel, program, now, accent, vw }: { channel: GuideGridChannel; program: GuideGridProgram; now: Date; accent: string; vw: (px: number) => number }) {
  const g: GuideMeta = program.guide;
  const start = new Date(program.startsAt);
  const end = new Date(start.getTime() + program.durationSeconds * 1000);
  let status = "";
  let pct = 0;
  if (now < start) status = `Starts ${fmtTime(start)}`;
  else if (now >= end) {
    status = "Ended";
    pct = 100;
  } else {
    status = `${Math.round((end.getTime() - now.getTime()) / MIN)}m left`;
    pct = Math.round(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100);
  }
  const audio = audioBadge(g.audioChannels);
  const isEpisode = !!g.showTitle && g.season != null && g.episode != null;
  const fv = (px: number) => vw(px * FEATURE_SCALE);
  const tk = useGuideTokens();
  const f = tk.featured;
  const fs = tk.fontScale;
  const Icon = channelIcon(channel.icon ?? channel.package?.icon);
  const tile = fv(64);
  const fg = accentFg(tk, accent);
  const st = tk.circleStyle;
  const fp = tk.featuredPlate;
  const misF = tk.misregister?.text.includes("featured") ? tk.misregister : null;
  const misCircle = tk.misregister?.shapes.includes("circle") ? tk.misregister : null;
  // What the featured text is printed on: its plate, else the guide's ground.
  const under = fp ? fp.bg : tk.bg;
  // The tile sits on that too, not on the rail: an `auto` glyph's ink is decided against it.
  const cc = circleColors(tk, { accent, fg, rowFocused: false, featured: true, under: featuredGround(tk) });
  const rimW = st.borderW === null ? line(1) : vw(st.borderW);
  const tileRadius = st.radius >= 0.5 ? tile / 2 : st.radius * tile;
  const stroke = tk.glyphStroke === 2 ? {} : { strokeWidth: tk.glyphStroke };
  const nameColor = tk.featuredName === "accent" ? fg : tk.featuredName;
  const numberColor = tk.featuredName === "accent" && tk.accentMode === "channel" ? hexA(fg, f.numberA) : nameColor;
  const featuredFace = (size: number, lineHeight?: number) => {
    const face = roleText(tk, "featured", size);
    return lineHeight ? { ...face, lineHeight: face.fontSize * lineHeight } : face;
  };
  const text = (size: number) => faceText(tk, "text", size * fs);
  const prog = featuredProgress(tk, fg);
  // The dimension line is as wide as the panel's text column, which is only known once it is laid out.
  const [barW, setBarW] = useState(0);

  const column = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: fv(22) }}>
        <View style={{ width: tile, height: tile, borderRadius: tileRadius, alignItems: "center", justifyContent: "center", backgroundColor: cc.fill, borderWidth: misCircle ? 0 : rimW, borderColor: cc.border }}>
          <Icon size={fv(34)} color={cc.glyph} {...stroke} />
          {misCircle && rimW > 0 && (
            <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, borderRadius: tileRadius, borderWidth: rimW, borderColor: cc.border, ...misShapeStyle(misCircle, vw, "rim") }} />
          )}
        </View>
        <MisText mis={misF} vw={vw} under={under} face={featuredFace(fv(44))} color={numberColor}>
          {channel.number}
        </MisText>
        <MisText mis={misF} vw={vw} under={under} face={featuredFace(fv(44))} color={nameColor} numberOfLines={1} box={{ flexShrink: 1 }}>
          {channel.name}
        </MisText>
      </View>

      {(g.genres?.length || g.tagline) && (
        <Text style={{ marginTop: fv(14), ...text(fv(30)), color: f.tagline }}>
          {[g.genres?.slice(0, 2).join(" · "), g.tagline].filter(Boolean).join(" · ")}
        </Text>
      )}

      <View style={{ height: 1, backgroundColor: f.rule, marginTop: fv(22), marginBottom: fv(26) }} />

      <View style={{ flexDirection: "row", alignItems: "center", gap: fv(28) }}>
        <MisText mis={misF} vw={vw} under={under} face={featuredFace(fv(60), 1.05)} color={f.title} box={{ flex: 1 }}>
          {(ink) => (
            <>
              {isEpisode ? g.showTitle : g.title}
              {isEpisode && <Text style={{ fontWeight: fixedWeight(tk, "episode"), color: ink ?? f.episode }}> S{g.season}, E{g.episode}{g.title ? ` · ${g.title}` : ""}</Text>}
            </>
          )}
        </MisText>
        <View style={{ flexDirection: "row", gap: fv(14) }}>
          {is4K(g.resolution) ? <Badge label="4K" colors={tk.badge.res.grad} textColor={tk.badge.res.text} fv={fv} tk={tk} /> : isHD(g.resolution) ? <Badge label="HD" colors={tk.badge.res.grad} textColor={tk.badge.res.text} fv={fv} tk={tk} /> : null}
          {g.hdr && <Badge label={g.hdr === "Dolby Vision" ? "DV" : "HDR"} colors={tk.badge.hdr.grad} textColor={tk.badge.hdr.text} fv={fv} tk={tk} />}
          {audio && <Badge label={audio} colors={tk.badge.audio.grad} textColor={tk.badge.audio.text} fv={fv} tk={tk} />}
          {g.dynamicAudio && <Badge label={g.dynamicAudio === "Atmos" ? "ATMOS" : g.dynamicAudio} colors={tk.badge.audio.grad} textColor={tk.badge.audio.text} fv={fv} tk={tk} />}
        </View>
      </View>

      <View style={{ marginTop: fv(22), flexDirection: "row", alignItems: "center", gap: fv(16) }}>
        {g.year != null && <Text style={{ ...text(fv(34)), color: f.meta }}>{g.year}</Text>}
        {g.year != null && g.contentRating && <Text style={{ ...text(fv(34)), color: f.sep }}>·</Text>}
        {g.contentRating && <Text style={{ ...text(fv(34)), color: f.meta }}>{g.contentRating}</Text>}
        {g.criticRating != null && (
          <>
            <Text style={{ ...text(fv(34)), color: f.sep }}>·</Text>
            <Star size={fv(34)} color={f.star} fill={f.star} />
            <Text style={{ ...text(fv(34)), color: f.meta }}>{g.criticRating.toFixed(1)}</Text>
          </>
        )}
      </View>

      <Text numberOfLines={2} style={{ marginTop: fv(22), ...text(fv(36)), lineHeight: fv(36) * fs * 1.4, minHeight: fv(36) * fs * 1.4 * 2, color: f.summary }}>
        {g.summary ?? ""}
      </Text>

      <View style={{ marginTop: fv(26), flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ ...text(fv(34)), color: f.meta }}>{fmtTime(start)} - {fmtTime(end)}</Text>
        <Text style={{ ...text(fv(34)), color: f.status }}>{status}</Text>
      </View>
      {prog.kind === "ticks" ? (
        <View onLayout={(e) => setBarW(e.nativeEvent.layout.width)} style={{ marginTop: fv(14), height: vw(prog.h) }}>
          {barW > 0 && (
            <DimensionLine
              width={barW}
              height={vw(prog.h)}
              pct={Math.max(0, Math.min(1, pct / 100))}
              step={barW / Math.max(1, program.durationSeconds / 60 / prog.ticks.every)}
              phase={0}
              t={prog.ticks}
              u={vw(1)}
              nowColor={tk.now}
            />
          )}
        </View>
      ) : (
        <View
          style={{
            marginTop: fv(16),
            height: prog.h === null ? fv(8) : vw(prog.h),
            borderRadius: prog.r === null ? 999 : vw(prog.r),
            backgroundColor: prog.track,
            overflow: "hidden",
            ...(prog.border ? (prog.border.sides === "top" ? { borderTopWidth: vw(prog.border.w), borderTopColor: prog.border.color } : { borderWidth: vw(prog.border.w), borderColor: prog.border.color }) : {}),
          }}
        >
          <View style={{ height: "100%", borderRadius: prog.r === null ? 999 : vw(prog.r), backgroundColor: prog.fill, width: `${pct}%` }} />
        </View>
      )}
    </>
  );

  if (!fp) return <View style={{ flex: 1, minWidth: 0 }}>{column}</View>;
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      {fp.shadow && (
        <View pointerEvents="none" style={{ position: "absolute", left: vw(fp.shadow.dx), top: vw(fp.shadow.dy), right: -vw(fp.shadow.dx), bottom: -vw(fp.shadow.dy), borderRadius: vw(fp.radius), backgroundColor: fp.shadow.color }} />
      )}
      <View style={{ backgroundColor: fp.bg, borderWidth: vw(fp.border.w), borderColor: fp.border.color, borderRadius: vw(fp.radius), paddingTop: vw(24), paddingHorizontal: vw(34), paddingBottom: vw(20) }}>{column}</View>
    </View>
  );
}

function FeaturedPanel({ channel, program, now, accent, vw, onTune }: { channel: GuideGridChannel; program: GuideGridProgram; now: Date; accent: string; vw: (px: number) => number; onTune: () => void }) {
  const fv = (px: number) => vw(px * FEATURE_SCALE);

  // The mini feed docks into a slot on the right of the featured panel (like tv-web). Reserve the
  // slot when a mini feed is playing, measure its screen rect, and hand it to the player — the
  // persistent PlayerHost animates the video there. Clear it when there's no mini / on unmount.
  const player = usePlayer();
  const miniActive = player.layout === "mini";
  const slotRef = useRef<View>(null);
  const measureSlot = useCallback(() => {
    slotRef.current?.measureInWindow((sx, sy, sw, sh) => {
      if (sw > 0 && sh > 0) player.setMiniSlot({ x: sx, y: sy, width: sw, height: sh });
    });
  }, [player]);
  useEffect(() => {
    if (!miniActive) {
      player.setMiniSlot(null);
      return;
    }
    // Measure once the layout SETTLES. A single rAF can fire before the guide's ancestors finish
    // positioning → a stale (top-ish) rect that only corrected when a focus re-render re-measured. Take
    // it across a couple of frames + a short delay so the bottom-aligned slot lands right on dock.
    const r1 = requestAnimationFrame(measureSlot);
    const r2 = requestAnimationFrame(() => requestAnimationFrame(measureSlot));
    const t = setTimeout(measureSlot, 300);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      clearTimeout(t);
      player.setMiniSlot(null);
    };
  }, [miniActive, measureSlot, player]);

  return (
    <Pressable onPress={onTune} focusable={!Platform.isTV} style={{ flexDirection: "row", alignItems: "flex-start", paddingTop: fv(40), paddingHorizontal: fv(64) }}>
      <FeaturedBody channel={channel} program={program} now={now} accent={accent} vw={vw} />

      {/* The mini-feed dock. Outer stretches to the featured panel's full height and BOTTOM-aligns its
          child, so the video's bottom lines up with the progress bar on the left. Inner is a TRUE 16:9
          box (fixed width → `aspectRatio` derives the height with no circular layout), so the measured
          slot is exactly 16:9 and the video fills it regardless of how mpv's contentFit behaves. Only
          while a mini feed plays. */}
      {miniActive && (
        <View onLayout={measureSlot} style={{ alignSelf: "stretch", justifyContent: "flex-end", marginLeft: fv(40) }}>
          <View ref={slotRef} onLayout={measureSlot} style={{ width: fv(970), aspectRatio: 16 / 9, borderRadius: cs(14) }} />
        </View>
      )}
    </Pressable>
  );
}
