import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { LinearGradient } from "expo-linear-gradient";
import { Heart, Star } from "lucide-react-native";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Text, useWindowDimensions, View } from "react-native";

import { TvPressable as Pressable } from "@/components/tv-pressable";

import { usePlayer } from "@/features/watch/player-ctx";
import type { GuideGridChannel, GuideGridProgram, GuideMeta } from "@/lib/api";
import { LAYER, useKeyLayer } from "@/lib/input";
import { C } from "@/lib/theme";
import { channelTint } from "@/lib/tint";
import { usePackages } from "@/hooks/queries";

import { GuideGhost } from "./guide-ghost";
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
  LEAD_MIN,
  liveProgramIndex,
  MIN,
  OVERSCAN_H,
  OVERSCAN_V,
  PROGRESS_FILL_ELAPSED_STRONGER,
  ROW_FRAC,
  SIDEBAR_SLIVER_W,
  subLine,
  UI_SCALE,
  vwOf,
  WINDOW_MIN,
} from "./layout";

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
  // Subtract the Android-TV overscan inset from the layout width so the grid fits inside the safe area
  // (0 on iPad/Apple TV). The root View below pads by the same amount.
  const { width: winW } = useWindowDimensions();
  const width = winW - OVERSCAN_H * 2;
  const vw = useCallback((px: number) => vwOf(width, px), [width]);

  const now = useMemo(() => new Date(serverTime), [serverTime]);
  const T0 = useMemo(() => {
    const d = new Date(now.getTime() - LEAD_MIN * MIN);
    const m = d.getMinutes();
    d.setMinutes(m >= 31 ? 31 : m >= 1 ? 1 : -29, 0, 0);
    return d;
  }, [now]);

  const colW = Math.max(1, width - SIDEBAR_SLIVER_W);
  const railPx = colW * CH_FRAC * UI_SCALE;
  const rowPx = width * ROW_FRAC * UI_SCALE;
  const laneW = Math.max(1, colW - railPx);
  const ppm = laneW / WINDOW_MIN;
  const minsFrom = useCallback((iso: string | Date) => ((typeof iso === "string" ? new Date(iso).getTime() : iso.getTime()) - T0.getTime()) / MIN, [T0]);
  const laneX = useCallback((iso: string | Date) => minsFrom(iso) * ppm, [minsFrom, ppm]);
  const nowMins = minsFrom(now);

  // Sidebar lens + package list.
  const [lens, setLens] = useState<Lens>({ type: "all" });
  const { data: pkgData } = usePackages();
  const sidebarItems = useMemo(() => buildSidebarItems(pkgData?.packages ?? [], lens), [pkgData, lens]);
  // The zone machine — grid ↔ rail ↔ sidebar, ported from tv-web's aurora-grid. Both touch and the
  // D-pad dispatcher drive this same state (sidebar expanded ⇔ zone === "sidebar").
  const [zone, setZone] = useState<"grid" | "rail" | "sidebar">("grid");
  const [sidebarSel, setSidebarSel] = useState(0);
  const sidebarExpanded = zone === "sidebar";
  const player = usePlayer();

  // Recents/favorites lenses filter the channel list (favorites via the passed set).
  const channels = useMemo(() => {
    const inLens = (c: GuideGridChannel): boolean =>
      lens.type === "all"
        ? true
        : lens.type === "packages"
          ? !!c.package && lens.ids.includes(c.package.id)
          : lens.type === "favorites"
            ? favoriteIds.has(c.id)
            : true; // recents handled server-side elsewhere; kept simple here
    // Cull each channel's programs to what's actually on the visible grid — within the window AND wide
    // enough to render (not a rail-edge sliver) — at the SOURCE, matching tv-web (§7.1). This is what
    // makes the rows cheap: otherwise every row maps the whole day's back-buffer on EVERY keypress (the
    // guide lag), and `fp` could land on a hidden program. Same math as the Row's inline positioning.
    const visible = (p: GuideGridProgram): boolean => {
      const start = minsFrom(p.startsAt);
      const end = start + p.durationSeconds / 60;
      if (!(end > 0 && start < WINDOW_MIN)) return false; // ended before the rail, or starts past the window
      const rawLeft = laneX(p.startsAt);
      const rawRight = rawLeft + Math.max(laneW * 0.02, (p.durationSeconds / 60) * ppm) - 6;
      const left = rawLeft < 0 ? 6 : rawLeft;
      return rawRight - left >= 8; // cull rail-edge slivers (matches the Row's `cw < 8`)
    };
    return rawChannels.filter(inLens).map((c): GuideGridChannel => ({ ...c, programs: c.programs.filter(visible) }));
  }, [rawChannels, lens, favoriteIds, minsFrom, laneX, laneW, ppm]);

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
      // Back on the guide with a mini feed docked → stop it. (Guide root has no in-app exit on tvOS —
      // the Home button leaves the app.)
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
  // Scroll the list only when the focused channel would be OFF-SCREEN (tv-web parity) — otherwise leave
  // it PUT, so moving up/down feels like you're travelling through the visible rows and the list only
  // scrolls once you hit the top/bottom edge (not the old "always re-center", which never felt like
  // scrolling). Rows are a fixed height (rowPx), so the visible band = [scrollY, scrollY + listHeight].
  // We predict the new offset after a programmatic scroll so rapid presses stay consistent. TV only —
  // iPad keeps native touch-scroll (this is a no-op there).
  useEffect(() => {
    if (!Platform.isTV || !channels.length) return;
    if (zone !== "grid" && zone !== "rail") return;
    const h = listHRef.current;
    const top = fc * rowPx;
    const bottom = top + rowPx;
    const off = scrollYRef.current;
    try {
      if (h <= 0) {
        listRef.current?.scrollToIndex({ index: fc, animated: false, viewPosition: 0 }); // not measured yet
      } else if (top < off) {
        listRef.current?.scrollToIndex({ index: fc, animated: false, viewPosition: 0 }); // above → to top
        scrollYRef.current = top;
      } else if (bottom > off + h) {
        listRef.current?.scrollToIndex({ index: fc, animated: false, viewPosition: 1 }); // below → to bottom
        scrollYRef.current = Math.max(0, bottom - h);
      }
      // else: already fully visible → don't scroll.
    } catch {
      // index not measured yet / out of range — the next fc change re-tries.
    }
  }, [fc, zone, channels.length, rowPx]);

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: C.bg, paddingLeft: OVERSCAN_H, paddingRight: OVERSCAN_H, paddingTop: OVERSCAN_V, paddingBottom: OVERSCAN_V }}>
      {/* The guide column — the layout reserves only the sliver width; the sidebar overlays it. Must use
          the SAME chrome-scaled width as the sidebar (cs), or the content sits offset by the old width. */}
      <View style={{ width: cs(SIDEBAR_SLIVER_W), flexShrink: 0 }} />
      <View style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {channels.length > 0 && focusedChannel && focusedProgram ? (
          <FeaturedPanel channel={focusedChannel} program={focusedProgram} now={now} accent={channelTint(focusedChannel) ?? accentOf(fc)} vw={vw} onTune={() => onTune(focusedChannel.id)} />
        ) : (
          <View style={{ height: vw(600) }} />
        )}

        {channels.length > 0 && <TimeHeader T0={T0} railPx={railPx} laneX={laneX} vw={vw} />}

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
          ) : (
            <FlashList
              ref={listRef}
              data={channels}
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
                  laneX={laneX}
                  laneW={laneW}
                  ppm={ppm}
                  minsFrom={minsFrom}
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
                borderTopColor: C.now,
                zIndex: 7,
              }}
            />
          )}
        </View>
      </View>

      {/* Scrim behind the expanded sidebar — tap to collapse. */}
      {sidebarExpanded && (
        <Pressable onPress={() => setZone("grid")} focusable={!Platform.isTV} style={{ position: "absolute", inset: 0, backgroundColor: "rgba(6,10,20,0.55)", zIndex: 24 }} />
      )}

      <GuideSidebar
        items={sidebarItems}
        expanded={sidebarExpanded}
        focused={zone === "sidebar"}
        sel={sidebarSel}
        lens={lens}
        onActivate={activateSidebar}
        onExpand={() => { setZone("sidebar"); setSidebarSel(0); }}
      />
    </View>
  );
}

function TimeHeader({ T0, railPx, laneX, vw }: { T0: Date; railPx: number; laneX: (d: Date) => number; vw: (px: number) => number }) {
  const ticks = Array.from({ length: Math.ceil(WINDOW_MIN / 30) + 1 }, (_, i) => new Date(T0.getTime() + i * 30 * MIN));
  return (
    <View style={{ position: "relative", height: vw(52), flexShrink: 0, marginTop: vw(56), marginBottom: vw(20) }}>
      <Text style={{ position: "absolute", left: vw(40), top: vw(6), fontSize: vw(32), fontWeight: "600", color: "#e6eaf1" }}>{fmtDay(T0)}</Text>
      <View style={{ position: "absolute", left: railPx, right: 0, top: 0, bottom: 0 }}>
        {ticks.map((t, i) => (
          <Text key={i} style={{ position: "absolute", left: laneX(t), top: vw(6), fontSize: vw(32), fontWeight: "600", color: "#c3c9d4" }}>
            {fmtTime(t)}
          </Text>
        ))}
      </View>
    </View>
  );
}

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
  laneX,
  laneW,
  ppm,
  minsFrom,
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
  laneX: (d: string | Date) => number;
  laneW: number;
  ppm: number;
  minsFrom: (d: string | Date) => number;
  vw: (px: number) => number;
}) {
  const Icon = channelIcon(channel.icon ?? channel.package?.icon);
  const circle = vw(64 * FEATURE_SCALE);

  return (
    <View style={{ height: rowPx, flexDirection: "row", borderTopWidth: 1, borderTopColor: C.rowBorder }}>
      {/* Rail — tap to focus; tap again (rail-focused) toggles favorite. The circle mirrors tv-web:
          when rail-focused it becomes the favorite heart (filled red if favorited, else outline). */}
      <Pressable onPress={() => onRailTap(index)} focusable={!Platform.isTV} style={{ width: railPx, paddingVertical: vw(18), paddingHorizontal: vw(20), justifyContent: "space-between", backgroundColor: focused ? hexA(accent, 0.12) : "transparent" }}>
        {focused && <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: vw(4), backgroundColor: accent }} />}
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ width: circle, height: circle, borderRadius: circle / 2, alignItems: "center", justifyContent: "center", backgroundColor: hexA(accent, 0.2), borderWidth: railFocused ? 2 : 1, borderColor: railFocused ? C.ring : hexA(accent, 0.35) }}>
            {railFocused ? (
              <Heart size={vw(34 * FEATURE_SCALE)} color={favorited ? C.fav : "#c3c9d4"} fill={favorited ? C.fav : "none"} />
            ) : (
              <Icon size={vw(34 * FEATURE_SCALE)} color={accent} />
            )}
            {favorited && !railFocused && (
              <View style={{ position: "absolute", right: -vw(4), bottom: -vw(4) }}>
                <Heart size={vw(22)} color={C.fav} fill={C.fav} />
              </View>
            )}
          </View>
          <Text style={{ fontSize: vw(34), fontWeight: "700", color: focused ? "#e6eaf1" : C.mutedFg }}>{channel.number}</Text>
        </View>
        <Text numberOfLines={2} style={{ fontSize: vw(23), color: C.mutedFg, lineHeight: vw(23) * 1.2 }}>
          {channel.name}
        </Text>
      </Pressable>

      {/* Lane */}
      <View style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {channel.programs.map((p, pi) => {
          const start = minsFrom(p.startsAt);
          const end = start + p.durationSeconds / 60;
          if (!(end > 0 && start < WINDOW_MIN)) return null;
          const selected = p.id === focusedProgramId;
          const startMs = new Date(p.startsAt).getTime();
          const live = now.getTime() >= startMs && now.getTime() < startMs + p.durationSeconds * 1000;
          const rawLeft = laneX(p.startsAt);
          // `gap` = the raw-dp space between adjacent cells; chrome-scale it so it stays proportional to
          // the (width-scaled) cells on Android TV's 960dp space — else it reads as too-wide gaps there.
          const gap = cs(6);
          const rawRight = rawLeft + Math.max(laneW * 0.02, (p.durationSeconds / 60) * ppm) - gap;
          const left = rawLeft < 0 ? gap : rawLeft;
          const cw = rawRight - left;
          if (cw < 8) return null;
          const fillPct = Math.max(0, Math.min(1, (laneX(now) - left) / cw));
          const [fillA, fillB] = PROGRESS_FILL_ELAPSED_STRONGER ? [hexA(accent, 0.32), hexA(accent, 0.1)] : [hexA(accent, 0.1), hexA(accent, 0.32)];
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
                borderRadius: cs(8),
                overflow: "hidden",
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? C.ring : C.cellBorder,
                backgroundColor: live ? "transparent" : "rgba(148,163,184,0.05)",
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
              {live && <View style={{ position: "absolute", left: 3, top: 10, bottom: 10, width: 3, borderRadius: 4, backgroundColor: accent }} />}
              <View style={{ paddingTop: vw(20), paddingHorizontal: vw(20) }}>
                <Text numberOfLines={1} style={{ fontSize: vw(34), fontWeight: "600", color: "#f1f5f9" }}>
                  {p.guide.showTitle ?? p.guide.title}
                </Text>
                <Text numberOfLines={1} style={{ marginTop: vw(12), fontSize: vw(26), color: C.mutedFg }}>
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

const BADGE_GRAD = {
  res: ["#7fd6de", "#4bb8c9"] as const,
  hdr: ["#f0c14b", "#e0a020"] as const,
  audio: ["#1e293b", "#334155"] as const,
};

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
          <View style={{ width: tile, height: tile, borderRadius: tile / 2, alignItems: "center", justifyContent: "center", backgroundColor: hexA(accent, 0.2), borderWidth: 1, borderColor: hexA(accent, 0.35) }}>
            <Icon size={fv(34)} color={accent} />
          </View>
          <Text style={{ fontSize: fv(44), fontWeight: "700", color: hexA(accent, 0.75) }}>{channel.number}</Text>
          <Text numberOfLines={1} style={{ fontSize: fv(44), fontWeight: "700", color: accent, flexShrink: 1 }}>
            {channel.name}
          </Text>
        </View>

        {(g.genres?.length || g.tagline) && (
          <Text style={{ marginTop: fv(14), fontSize: fv(30), color: "#64748b" }}>
            {[g.genres?.slice(0, 2).join(" · "), g.tagline].filter(Boolean).join(" · ")}
          </Text>
        )}

        <View style={{ height: 1, backgroundColor: C.border, marginTop: fv(22), marginBottom: fv(26) }} />

        <View style={{ flexDirection: "row", alignItems: "center", gap: fv(28) }}>
          <Text style={{ flex: 1, fontSize: fv(60), fontWeight: "700", lineHeight: fv(60) * 1.05, color: "#f1f5f9" }}>
            {isEpisode ? g.showTitle : g.title}
            {isEpisode && <Text style={{ fontWeight: "400", color: "#c3c9d4" }}> S{g.season}, E{g.episode}{g.title ? ` · ${g.title}` : ""}</Text>}
          </Text>
          <View style={{ flexDirection: "row", gap: fv(14) }}>
            {is4K(g.resolution) ? <Badge label="4K" colors={BADGE_GRAD.res} textColor="#06222a" fv={fv} /> : isHD(g.resolution) ? <Badge label="HD" colors={BADGE_GRAD.res} textColor="#06222a" fv={fv} /> : null}
            {g.hdr && <Badge label={g.hdr === "Dolby Vision" ? "DV" : "HDR"} colors={BADGE_GRAD.hdr} textColor="#2a1e00" fv={fv} />}
            {audio && <Badge label={audio} colors={BADGE_GRAD.audio} textColor="#dfe4ec" fv={fv} />}
            {g.dynamicAudio && <Badge label={g.dynamicAudio === "Atmos" ? "ATMOS" : g.dynamicAudio} colors={BADGE_GRAD.audio} textColor="#dfe4ec" fv={fv} />}
          </View>
        </View>

        <View style={{ marginTop: fv(22), flexDirection: "row", alignItems: "center", gap: fv(16) }}>
          {g.year != null && <Text style={{ fontSize: fv(34), color: "#c3c9d4" }}>{g.year}</Text>}
          {g.year != null && g.contentRating && <Text style={{ fontSize: fv(34), color: "#475569" }}>·</Text>}
          {g.contentRating && <Text style={{ fontSize: fv(34), color: "#c3c9d4" }}>{g.contentRating}</Text>}
          {g.criticRating != null && (
            <>
              <Text style={{ fontSize: fv(34), color: "#475569" }}>·</Text>
              <Star size={fv(34)} color={C.star} fill={C.star} />
              <Text style={{ fontSize: fv(34), color: "#c3c9d4" }}>{g.criticRating.toFixed(1)}</Text>
            </>
          )}
        </View>

        <Text numberOfLines={2} style={{ marginTop: fv(22), fontSize: fv(36), lineHeight: fv(36) * 1.4, minHeight: fv(36) * 1.4 * 2, color: "#c9cfda" }}>
          {g.summary ?? ""}
        </Text>

        <View style={{ marginTop: fv(26), flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ fontSize: fv(34), color: "#c3c9d4" }}>{fmtTime(start)} - {fmtTime(end)}</Text>
          <Text style={{ fontSize: fv(34), color: "#e6eaf1" }}>{status}</Text>
        </View>
        <View style={{ marginTop: fv(16), height: fv(8), borderRadius: 999, backgroundColor: "rgba(148,163,184,0.18)", overflow: "hidden" }}>
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
