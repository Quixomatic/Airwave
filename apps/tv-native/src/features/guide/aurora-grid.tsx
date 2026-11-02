import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { Heart, Star } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, useWindowDimensions, View } from "react-native";

import { TvPressable as Pressable } from "@/components/tv-pressable";

import { usePlayer } from "@/features/watch/player-ctx";
import type { GuideGridChannel, GuideGridProgram, GuideMeta } from "@/lib/api";
import { LAYER, setBackExitsApp, useKeyLayer } from "@/lib/input";
import { channelTint } from "@/lib/tint";
import { usePackages } from "@/hooks/queries";

import { cellBox, isVisible, liveFill, timelineOrigin, type Lane } from "./geometry";
import { GuideGhost } from "./guide-ghost";
import { reportNativeGuideError } from "./guide-renderer";
import { useGuideTokens } from "./guide-tokens";
import { GuideSidebar, buildSidebarItems, lensEquals, type Lens } from "./guide-sidebar";
import {
  accentOf,
  audioBadge,
  channelIcon,
  CH_FRAC,
  cs,
  FEATURE_SCALE,
  fmtDay,
  fmtTime,
  hexA,
  line,
  liveProgramIndex,
  MIN,
  ROW_FRAC,
  SIDEBAR_SLIVER_W,
  subLine,
  UI_SCALE,
  vwOf,
  WINDOW_MIN,
} from "./layout";
import { NativeRows } from "./native-rows";
import { classicFollow, classicHandOver, type NativeScroll } from "./native-rows-logic";
import { useGuideRenderer } from "./use-guide-renderer";

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

  const colW = Math.max(1, width - SIDEBAR_SLIVER_W);
  const railPx = colW * CH_FRAC * UI_SCALE;
  const rowPx = width * ROW_FRAC * UI_SCALE;
  const laneW = Math.max(1, colW - railPx);
  const ppm = laneW / WINDOW_MIN;
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
      {/* The guide column — the layout reserves only the sliver width; the sidebar overlays it. Must use
          the SAME chrome-scaled width as the sidebar (cs), or the content sits offset by the old width. */}
      <View style={{ width: cs(SIDEBAR_SLIVER_W), flexShrink: 0 }} />
      <View style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {channels.length > 0 && focusedChannel && focusedProgram ? (
          <FeaturedPanel channel={focusedChannel} program={focusedProgram} now={now} accent={channelTint(focusedChannel) ?? accentOf(fc)} vw={vw} onTune={() => onTune(focusedChannel.id)} />
        ) : (
          <View style={{ height: vw(600) }} />
        )}

        {channels.length > 0 && <TimeHeaderMemo T0={T0} railPx={railPx} laneX={laneX} vw={vw} />}

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
                  accent={channelTint(item) ?? accentOf(index)}
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

          {/* now-marker triangle, capping the grid at the current time. */}
          {channels.length > 0 && nowMins >= 0 && nowMins <= WINDOW_MIN && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: -vw(14),
                left: railPx + laneX(now) - vw(9),
                width: 0,
                height: 0,
                borderLeftWidth: vw(9),
                borderRightWidth: vw(9),
                borderTopWidth: vw(14),
                borderLeftColor: "transparent",
                borderRightColor: "transparent",
                borderTopColor: tk.now,
                zIndex: 7,
              }}
            />
          )}
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
    </View>
  );
}

function TimeHeader({ T0, railPx, laneX, vw }: { T0: Date; railPx: number; laneX: (d: Date) => number; vw: (px: number) => number }) {
  const tk = useGuideTokens();
  const ticks = Array.from({ length: Math.ceil(WINDOW_MIN / 30) + 1 }, (_, i) => new Date(T0.getTime() + i * 30 * MIN));
  return (
    <View style={{ position: "relative", height: vw(52), flexShrink: 0, marginTop: vw(56), marginBottom: vw(20) }}>
      <Text style={{ position: "absolute", left: vw(40), top: vw(6), fontSize: vw(32), fontWeight: "600", color: tk.headerDay }}>{fmtDay(T0)}</Text>
      <View style={{ position: "absolute", left: railPx, right: 0, top: 0, bottom: 0 }}>
        {ticks.map((t, i) => (
          <Text key={i} style={{ position: "absolute", left: laneX(t), top: vw(6), fontSize: vw(32), fontWeight: "600", color: tk.headerTick }}>
            {fmtTime(t)}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * The time header holds still while the focus moves (its props are memoized above: the origin, `laneX` and the scaler), so a D-pad
 * step has no reason to run it again. Its own token read (`useGuideTokens`) still re-renders it when that changes.
 */
const TimeHeaderMemo = memo(TimeHeader);

// Memoized: with stable props (the `now`/laneX/vw memos + the ref-backed onRailTap/onProgramTap), only the
// rows whose focus/favorited actually changed re-render on navigation — not every visible row.
const RowMemo = memo(Row);

function Row({
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
}) {
  const tk = useGuideTokens();
  const Icon = channelIcon(channel.icon ?? channel.package?.icon);
  const circle = vw(64 * FEATURE_SCALE);

  return (
    <View style={{ height: rowPx, flexDirection: "row", borderTopWidth: 1, borderTopColor: tk.rowBorder }}>
      {/* Rail — tap to focus; tap again (rail-focused) toggles favorite. The circle mirrors tv-web:
          when rail-focused it becomes the favorite heart (filled red if favorited, else outline). */}
      <Pressable onPress={() => onRailTap(index)} focusable={!Platform.isTV} style={{ width: railPx, paddingVertical: vw(18), paddingHorizontal: vw(20), justifyContent: "space-between", backgroundColor: focused ? hexA(accent, tk.railFocusAlpha) : "transparent" }}>
        {focused && <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: vw(4), backgroundColor: accent }} />}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ width: circle, height: circle, borderRadius: circle / 2, alignItems: "center", justifyContent: "center", backgroundColor: hexA(accent, tk.circle.fillA), borderWidth: railFocused ? line(tk.ringW) : line(1), borderColor: railFocused ? tk.ring : hexA(accent, tk.circle.borderA) }}>
            {railFocused ? (
              <Heart size={vw(34 * FEATURE_SCALE)} color={favorited ? tk.fav : tk.heartOff} fill={favorited ? tk.fav : "none"} />
            ) : (
              <Icon size={vw(34 * FEATURE_SCALE)} color={accent} />
            )}
            {favorited && !railFocused && (
              <View style={{ position: "absolute", right: -vw(4), bottom: -vw(4) }}>
                <Heart size={vw(22)} color={tk.fav} fill={tk.fav} />
              </View>
            )}
          </View>
          <Text style={{ fontSize: vw(34), fontWeight: tk.numberWeight, color: focused ? tk.numberFocused : tk.number }}>{channel.number}</Text>
        </View>
        <Text numberOfLines={2} style={{ fontSize: vw(23), color: tk.name, lineHeight: vw(23) * 1.2 }}>
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
          const fillA = hexA(accent, tk.liveFill.elapsed);
          const fillB = hexA(accent, tk.liveFill.remain);
          return (
            <Pressable
              key={p.id}
              onPress={() => onProgramTap(index, pi)}
              focusable={!Platform.isTV}
              style={{
                position: "absolute",
                top: vw(6),
                left,
                width: cw,
                height: rowPx - vw(12),
                borderRadius: cs(tk.cellRadius),
                overflow: "hidden",
                borderWidth: selected ? line(tk.ringW) : line(tk.cellBorderW),
                borderColor: selected ? tk.ring : tk.cellBorder,
                backgroundColor: live ? tk.liveCellBg : tk.cellBg,
                zIndex: selected ? 4 : 1,
              }}
            >
              {live && (
                <LinearGradient
                  colors={[fillA, fillA, fillB, fillB]}
                  locations={[0, fillPct, fillPct, 1]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ position: "absolute", inset: 0 }}
                />
              )}
              {live && <View style={{ position: "absolute", left: vw(3), top: vw(10), bottom: vw(10), width: line(tk.liveBar.w), borderRadius: line(tk.liveBar.r), backgroundColor: accent }} />}
              <View style={{ paddingTop: vw(20), paddingHorizontal: vw(20) }}>
                <Text numberOfLines={1} style={{ fontSize: vw(34), fontWeight: tk.titleWeight, color: tk.title }}>
                  {p.guide.showTitle ?? p.guide.title}
                </Text>
                <Text numberOfLines={1} style={{ marginTop: vw(12), fontSize: vw(26), color: tk.sub }}>
                  {subLine(p.guide)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Badge({ label, colors, textColor, fv }: { label: string; colors: readonly [string, string]; textColor: string; fv: (px: number) => number }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: cs(8), paddingVertical: fv(6), paddingHorizontal: fv(16) }}>
      <Text style={{ fontSize: fv(30), fontWeight: "700", color: textColor }}>{label}</Text>
    </LinearGradient>
  );
}

function FeaturedPanel({ channel, program, now, accent, vw, onTune }: { channel: GuideGridChannel; program: GuideGridProgram; now: Date; accent: string; vw: (px: number) => number; onTune: () => void }) {
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
  const Icon = channelIcon(channel.icon ?? channel.package?.icon);
  const tile = fv(64);

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
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: fv(22) }}>
          <View style={{ width: tile, height: tile, borderRadius: tile / 2, alignItems: "center", justifyContent: "center", backgroundColor: hexA(accent, tk.circle.fillA), borderWidth: line(1), borderColor: hexA(accent, tk.circle.borderA) }}>
            <Icon size={fv(34)} color={accent} />
          </View>
          <Text style={{ fontSize: fv(44), fontWeight: "700", color: hexA(accent, f.numberA) }}>{channel.number}</Text>
          <Text numberOfLines={1} style={{ fontSize: fv(44), fontWeight: "700", color: accent, flexShrink: 1 }}>
            {channel.name}
          </Text>
        </View>

        {(g.genres?.length || g.tagline) && (
          <Text style={{ marginTop: fv(14), fontSize: fv(30), color: f.tagline }}>
            {[g.genres?.slice(0, 2).join(" · "), g.tagline].filter(Boolean).join(" · ")}
          </Text>
        )}

        <View style={{ height: 1, backgroundColor: f.rule, marginTop: fv(22), marginBottom: fv(26) }} />

        <View style={{ flexDirection: "row", alignItems: "center", gap: fv(28) }}>
          <Text style={{ flex: 1, fontSize: fv(60), fontWeight: "700", lineHeight: fv(60) * 1.05, color: f.title }}>
            {isEpisode ? g.showTitle : g.title}
            {isEpisode && <Text style={{ fontWeight: "400", color: f.episode }}> S{g.season}, E{g.episode}{g.title ? ` · ${g.title}` : ""}</Text>}
          </Text>
          <View style={{ flexDirection: "row", gap: fv(14) }}>
            {is4K(g.resolution) ? <Badge label="4K" colors={tk.badge.res.grad} textColor={tk.badge.res.text} fv={fv} /> : isHD(g.resolution) ? <Badge label="HD" colors={tk.badge.res.grad} textColor={tk.badge.res.text} fv={fv} /> : null}
            {g.hdr && <Badge label={g.hdr === "Dolby Vision" ? "DV" : "HDR"} colors={tk.badge.hdr.grad} textColor={tk.badge.hdr.text} fv={fv} />}
            {audio && <Badge label={audio} colors={tk.badge.audio.grad} textColor={tk.badge.audio.text} fv={fv} />}
            {g.dynamicAudio && <Badge label={g.dynamicAudio === "Atmos" ? "ATMOS" : g.dynamicAudio} colors={tk.badge.audio.grad} textColor={tk.badge.audio.text} fv={fv} />}
          </View>
        </View>

        <View style={{ marginTop: fv(22), flexDirection: "row", alignItems: "center", gap: fv(16) }}>
          {g.year != null && <Text style={{ fontSize: fv(34), color: f.meta }}>{g.year}</Text>}
          {g.year != null && g.contentRating && <Text style={{ fontSize: fv(34), color: f.sep }}>·</Text>}
          {g.contentRating && <Text style={{ fontSize: fv(34), color: f.meta }}>{g.contentRating}</Text>}
          {g.criticRating != null && (
            <>
              <Text style={{ fontSize: fv(34), color: f.sep }}>·</Text>
              <Star size={fv(34)} color={f.star} fill={f.star} />
              <Text style={{ fontSize: fv(34), color: f.meta }}>{g.criticRating.toFixed(1)}</Text>
            </>
          )}
        </View>

        <Text numberOfLines={2} style={{ marginTop: fv(22), fontSize: fv(36), lineHeight: fv(36) * 1.4, minHeight: fv(36) * 1.4 * 2, color: f.summary }}>
          {g.summary ?? ""}
        </Text>

        <View style={{ marginTop: fv(26), flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: fv(34), color: f.meta }}>{fmtTime(start)} - {fmtTime(end)}</Text>
          <Text style={{ fontSize: fv(34), color: f.status }}>{status}</Text>
        </View>
        <View style={{ marginTop: fv(16), height: fv(8), borderRadius: 999, backgroundColor: f.track, overflow: "hidden" }}>
          <View style={{ height: "100%", borderRadius: 999, backgroundColor: accent, width: `${pct}%` }} />
        </View>
      </View>

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
