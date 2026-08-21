import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { Heart, Loader2, Star, Tv, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GuideGridChannel, GuideGridProgram } from "../../lib/api";
import { LAYER, useKeyLayer } from "../../lib/input";
import { C } from "../../lib/theme";
import { channelTint } from "../../lib/tint";
import { useFavorites, useSetFavorite } from "../../hooks/use-favorites";
import { usePackages } from "../../hooks/use-packages";
import { useRecents } from "../../hooks/use-recents";
import { usePlayer } from "../watch/player-context";
import { GuideSidebar, SIDEBAR_SLIVER_W, buildSidebarItems, lensEquals, type Lens } from "./guide-sidebar";

/** Index of the program airing at `nowMs` (else 0) — the "on now" slot. */
function liveProgramIndex(programs: GuideGridProgram[], nowMs: number): number {
  const i = programs.findIndex((p) => {
    const s = new Date(p.startsAt).getTime();
    return nowMs >= s && nowMs < s + p.durationSeconds * 1000;
  });
  return i >= 0 ? i : 0;
}

// Resolve a channel's stored icon id (`lucide:Radio`) to its component. Presets use
// lucide only; `import *` lands in the (code-split) guide chunk, not the initial load.
const LUCIDE = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number | string }>>;
function channelIcon(id?: string | null): React.ComponentType<{ size?: number | string }> {
  if (id && id.startsWith("lucide:")) return LUCIDE[id.slice(7)] ?? LucideIcons.Radio;
  return LucideIcons.Radio;
}

/**
 * The Aurora guide grid — the 10-foot live-TV guide from the Claude Design handoff
 * (proportions/style spec in .docs/tv-design-spec.md). The design is authored at 2560px
 * wide; we use it as a PROPORTION guide, not fixed pixels: the layout is a flex column
 * that fills the viewport (the grid expands into leftover height), text/spacing are `vw`
 * (so they scale with screen width), and the horizontal time-grid is computed from the
 * ACTUAL lane width — so it fits whatever screen it's on.
 */

const DESIGN_W = 2560;
/** spec px (at 2560 wide) → vw, so sizing scales fluidly with the screen. */
const vw = (px: number) => `${(px / DESIGN_W) * 100}vw`;

const ACCENTS =["#2f9e8f", "#4a9fe0", "#3b82f6", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e", "#7c8aa3"];

const CH_FRAC = 212 / DESIGN_W; // channel rail = this fraction of width
const ROW_FRAC = 168 / DESIGN_W; // row height fraction (of width)
// The featured panel, sized purely off width, dominates a 16:9 panel (~60% tall).
// Shrink it uniformly (the grid keeps flex:1 for the rest). Tuned to give the
// feature area more room to breathe while the grid stays comfortably scrollable.
// Nudged up from 0.72 once the top Guide/Settings pill was retired into the sidebar,
// handing back some of the vertical space it used to occupy.
const FEATURE_SCALE = 0.76;
const WINDOW_MIN = 180; // minutes of timeline shown across the lane
const LEAD_MIN = 30; // minutes of "already aired" shown before the grid start
const MIN = 60_000;
// Cull guide program blocks narrower than this (px). A clamped program that ended right at the
// rail edge computes to a near-zero (or negative) width — a useless sliver, and a negative width
// is invalid CSS so the block would auto-expand to its content. Below this it isn't shown at all.
const MIN_VISIBLE_PX = 24;
const SHOW_NOW_LINE = false; // hidden for now — the triangle marker alone marks "now"
// Channel-change (up/down/wheel) highlight strategy. `true` = time-alignment: keep the same
// time column across channels (pickAtCursor). `false` = always snap to the channel's currently-
// airing "on now" program (pickAtLive); left/right still browses its other programs.
const TIME_ALIGN_CHANNEL_NAV = false;
// The live program's two-tone progress fill direction. `true` = elapsed (up to the live point)
// is the STRONGER tint, the not-yet-aired remainder is weaker. `false` = reversed.
const PROGRESS_FILL_ELAPSED_STRONGER = true;

const accentOf = (i: number) => ACCENTS[i % ACCENTS.length]!;
const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });

function subLine(g: GuideGridProgram["guide"]): string {
  const parts: string[] = [];
  if (g.season != null && g.episode != null) parts.push(`S${g.season}, E${g.episode}`);
  if (g.contentRating) parts.push(g.contentRating);
  if (g.durationMs) parts.push(`${Math.round(g.durationMs / 60000)}m`);
  return parts.join(" · ");
}
const audioBadge = (ch?: number) => (ch === 8 ? "7.1" : ch === 6 ? "5.1" : ch === 2 ? "Stereo" : ch ? "Mono" : null);
const isHD = (res?: string) => !!res && res !== "sd" && res !== "480";
const is4K = (res?: string) => res === "4k";
// Featured-panel badge fills — each badge's base color deepened slightly toward the right for a
// subtle left→right sheen (start = the original flat color, so the look is unchanged at the left edge).
const BADGE_GRAD = {
  res: "linear-gradient(90deg, #7fd6de, #4bb8c9)", // 4K / HD (cyan)
  hdr: "linear-gradient(90deg, #f0c14b, #e0a020)", // HDR / DV (gold)
  audio: "linear-gradient(90deg, #1e293b, #334155)", // channels + ATMOS/DTS:X (slate)
} as const;

export function AuroraGrid({
  channels: rawChannels,
  serverTime,
  onTune,
  onSettings,
  onAccount,
  loading = false,
  errored = false,
}: {
  channels: GuideGridChannel[];
  serverTime: string;
  onTune: (channelId: string) => void;
  onSettings: () => void;
  /** The sidebar's Account circle — opens the User settings page (where you can sign out). */
  onAccount: () => void;
  /** First-load: no data yet → the GuideGhost shows a "loading" message instead of an empty one. */
  loading?: boolean;
  /** The guide fetch failed (non-401) → the GuideGhost shows an "unreachable server" message. */
  errored?: boolean;
}) {
  const now = useMemo(() => new Date(serverTime), [serverTime]);
  const T0 = useMemo(() => {
    const d = new Date(now.getTime() - LEAD_MIN * MIN);
    const m = d.getMinutes();
    d.setMinutes(m >= 31 ? 31 : m >= 1 ? 1 : -29, 0, 0);
    return d;
  }, [now]);

  // Measure the actual width so the time-grid fills the real lane (fully responsive).
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1920));
  useEffect(() => {
    const f = () => setWidth(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  // The guide column is FIXED at viewport-minus-the-sliver and never moves: the sidebar only ever
  // occupies the sliver in the layout, and expanding it is a pure overlay on top. So the program
  // blocks and time axis are never shifted, reflowed, or smooshed — and the lane geometry stays
  // deterministic (no measuring, and no re-render during the expand animation).
  const colW = Math.max(1, width - SIDEBAR_SLIVER_W);
  const railPx = colW * CH_FRAC;
  const rowPx = width * ROW_FRAC;
  const laneW = Math.max(1, colW - railPx);
  const ppm = laneW / WINDOW_MIN; // px per minute, derived from the real lane width
  const minsFrom = (iso: string | Date) =>
    ((typeof iso === "string" ? new Date(iso).getTime() : iso.getTime()) - T0.getTime()) / MIN;
  const laneX = (iso: string | Date) => minsFrom(iso) * ppm; // px within the lane (0 = T0)
  const nowMins = minsFrom(now);

  // Active guide lens (which channels the sidebar filter shows) + the sidebar's package list.
  const [lens, setLens] = useState<Lens>({ type: "all" });
  const { data: pkgData } = usePackages();
  // `lens` is a dep because the item list gains/loses the "Show All" entry when a filter is
  // applied/cleared. This only ever recomputes while focus is in the grid (activating a lens
  // leaves the sidebar), so the index shift never lands mid-navigation.
  const sidebarItems = useMemo(() => buildSidebarItems(pkgData?.packages ?? [], lens), [pkgData, lens]);

  // Per-user favorites — the rail's heart + the "Favorites" lens.
  const { data: favData } = useFavorites();
  const favoriteIds = useMemo(() => new Set(favData?.channelIds ?? []), [favData]);
  const setFavorite = useSetFavorite();
  const toggleFavorite = useCallback(
    (channelId: string) => setFavorite.mutate({ channelId, favorite: !favoriteIds.has(channelId) }),
    [setFavorite, favoriteIds],
  );

  // Recently-watched channels (deduped, most-recent-first) — the "Recents" lens.
  const { data: recentData } = useRecents();
  const recentIds = useMemo(() => recentData?.channelIds ?? [], [recentData]);

  // The programs actually shown on the grid: within the visible window AND wide enough to render
  // (not a rail-edge sliver). Filtering the channel's programs HERE — not just in the render —
  // means D-pad nav can only land on a program you can actually see: one that ended before the
  // rail start (the API returns a back-buffer past it), or that clamps to a few-pixel sliver, is
  // now neither shown nor navigable. The currently-airing program is never affected (it's always
  // well within the window and full-width).
  const channels = useMemo(() => {
    const visible = (p: GuideGridProgram): boolean => {
      const start = (new Date(p.startsAt).getTime() - T0.getTime()) / MIN;
      const durMin = p.durationSeconds / 60;
      const end = start + durMin;
      if (!(end > 0 && start < WINDOW_MIN)) return false; // ended before the rail, or starts past the window
      const rawLeft = start * ppm;
      const rawRight = rawLeft + Math.max(laneW * 0.02, durMin * ppm) - 6;
      const left = rawLeft < 0 ? 6 : rawLeft;
      return rawRight - left >= MIN_VISIBLE_PX; // cull rail-edge slivers
    };
    // Channel-level lens filter — which channels the active sidebar filter shows.
    const inLens = (c: GuideGridChannel): boolean =>
      lens.type === "all"
        ? true
        : lens.type === "packages"
          ? c.package != null && lens.ids.includes(c.package.id)
          : lens.type === "favorites"
            ? favoriteIds.has(c.id)
            : recentIds.includes(c.id);
    let list = rawChannels.filter(inLens);
    // Recents is the one lens that isn't in channel-number order — it's ordered by when you last
    // watched each channel (the server returns them most-recent-first).
    if (lens.type === "recents") {
      const rank = new Map(recentIds.map((id, i) => [id, i]));
      list = list.slice().sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
    }
    return list.map((c) => ({ ...c, programs: c.programs.filter(visible) }));
  }, [rawChannels, ppm, laneW, T0, lens, favoriteIds, recentIds]);

  const [fc, setFc] = useState(0);
  const [fp, setFp] = useState(0);
  // Focus zone. Leftward chain off the grid: grid → rail (channel cell; favorite toggle later) →
  // sidebar. Guide/Settings/Account live in the sidebar now (the top nav pill is retired).
  const [zone, setZone] = useState<"grid" | "rail" | "sidebar">("grid");
  const [sidebarSel, setSidebarSel] = useState(0);
  const player = usePlayer();
  const cursorRef = useRef<number>(now.getTime());
  const scrollRef = useRef<HTMLDivElement>(null);
  // Live mirror of fc, so a burst of wheel ticks accumulates synchronously (no one-per-render lag).
  const fcRef = useRef(fc);
  fcRef.current = fc;

  // Virtualize the channel rows — with 100+ channels × program blocks, rendering them all
  // is what makes scrolling crawl on the C2. Render only the visible rows + an overscan of
  // 10 above/below (so nothing pops in mid-scroll). Row height is the dynamic, viewport-
  // derived rowPx; remeasure when it changes.
  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowPx,
    overscan: 10,
  });
  useEffect(() => rowVirtualizer.measure(), [rowPx, rowVirtualizer]);

  const focusedChannel = channels[fc];
  const focusedProgram = focusedChannel?.programs[fp];

  // Refs so the lens-change effect reads the latest filtered channels + clock without re-firing.
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const nowRef = useRef(now);
  nowRef.current = now;

  // Selecting a sidebar item: Settings/Account are actions; a lens item filters the grid and
  // returns focus to it. Shared by the pointer click (onActivate) and keyboard Enter.
  const activateSidebar = useCallback(
    (index: number) => {
      const item = sidebarItems[index];
      if (!item) return;
      setSidebarSel(index);
      if (item.kind === "settings") return onSettings();
      // Account opens the User settings page — signing out lives there behind a confirm, so a
      // stray OK on this circle can't sign you out.
      if (item.kind === "account") return onAccount();
      if (item.lens) {
        // Selecting the filter that's already applied toggles it OFF — back to all channels.
        // (Guide IS the "all" lens, so it never toggles; it just clears.)
        const next: Lens =
          item.lens.type !== "all" && lensEquals(item.lens, lens) ? { type: "all" } : item.lens;
        setLens(next);
        setZone("grid");
      }
    },
    [sidebarItems, onSettings, onAccount, lens],
  );

  // On a lens change, land focus on the first shown channel's live program (the filtered channel
  // list just changed, so the old fc/fp may be stale or out of range).
  useEffect(() => {
    setFc(0);
    fcRef.current = 0;
    setFp(liveProgramIndex(channelsRef.current[0]?.programs ?? [], nowRef.current.getTime()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lens]);

  useEffect(() => {
    const p = channels[fc]?.programs[fp];
    if (p) cursorRef.current = new Date(p.startsAt).getTime() + (p.durationSeconds * 1000) / 2;
  }, [fc, fp, channels]);

  // On first data load, focus the program airing right now on the selected channel
  // (not the recently-aired lead at index 0 that fills the grid's left edge).
  const didInitFocus = useRef(false);
  useEffect(() => {
    if (didInitFocus.current) return;
    const progs = channels[fc]?.programs;
    if (!progs?.length) return;
    didInitFocus.current = true;
    const i = liveProgramIndex(progs, now.getTime());
    if (i > 0) setFp(i);
  }, [channels, fc, now]);

  // When the player drops to a mini feed (returning from full), land focus on the
  // channel that's playing (its live program), so the guide matches the mini feed.
  const prevLayoutRef = useRef(player.layout);
  useEffect(() => {
    if (player.layout === "mini" && prevLayoutRef.current !== "mini" && player.playingChannelId) {
      const idx = channels.findIndex((c) => c.id === player.playingChannelId);
      if (idx >= 0) {
        setFc(idx);
        setFp(liveProgramIndex(channels[idx]!.programs, now.getTime()));
      }
    }
    prevLayoutRef.current = player.layout;
  }, [player.layout, player.playingChannelId, channels, now]);

  const pickAtCursor = (chIdx: number) => {
    const progs = channels[chIdx]?.programs ?? [];
    if (!progs.length) return 0;
    // Clamp the time cursor to the visible window before matching. If we were focused
    // on a program that started before the grid's left edge (a long already-airing item,
    // clamped to the rail), its midpoint sits off-screen-left — matching that raw time on
    // the next channel would land the focus on an equally off-screen program. Clamping to
    // [T0, T0+window] instead selects that channel's clamped/left-most in-view program.
    const winStart = T0.getTime();
    const winEnd = T0.getTime() + WINDOW_MIN * MIN;
    const cur = Math.min(Math.max(cursorRef.current, winStart), winEnd);
    const containing = progs.findIndex(
      (p) => new Date(p.startsAt).getTime() <= cur && new Date(p.startsAt).getTime() + p.durationSeconds * 1000 > cur,
    );
    if (containing >= 0) return containing;
    let best = 0;
    let bestD = Infinity;
    progs.forEach((p, i) => {
      const mid = new Date(p.startsAt).getTime() + (p.durationSeconds * 1000) / 2;
      const d = Math.abs(mid - cur);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  // Same shape as pickAtCursor, but always the channel's currently-airing ("on now") program —
  // so a channel change snaps to what's live and left/right browses from there.
  const pickAtLive = (chIdx: number) => liveProgramIndex(channels[chIdx]?.programs ?? [], now.getTime());

  // The strategy a channel change uses to pick the highlighted program (toggle at the top).
  const pickForChannel = TIME_ALIGN_CHANNEL_NAV ? pickAtCursor : pickAtLive;

  // Mouse (tv-tauri): click a program to FOCUS it (first click → its details in the featured panel),
  // click an already-focused program to TUNE — so you can browse with the mouse the same way the
  // keyboard navigates, without a stray click committing to a channel.
  const handleProgramClick = (channelIndex: number, programId: string) => {
    if (player.miniFocused) return;
    const ch = channels[channelIndex];
    if (!ch) return;
    const pi = ch.programs.findIndex((x) => x.id === programId);
    if (pi < 0) return;
    const alreadyFocused = zone === "grid" && fc === channelIndex && fp === pi;
    if (alreadyFocused) {
      onTune(ch.id);
      return;
    }
    setZone("grid");
    setFc(channelIndex);
    setFp(pi);
  };

  // Mouse on the RAIL — the same two-step as programs, but for the channel rail: click a rail to FOCUS
  // it (first click → the rail lights + its circle becomes the favorite heart, exactly like keyboard
  // Left-into-rail), and a SECOND click on the already-focused rail TOGGLES favorite. So you can land
  // on a channel's rail with the mouse without a stray click flipping a favorite.
  const handleRailClick = (channelIndex: number) => {
    if (player.miniFocused) return;
    const ch = channels[channelIndex];
    if (!ch) return;
    const alreadyRailFocused = zone === "rail" && fc === channelIndex;
    if (alreadyRailFocused) {
      toggleFavorite(ch.id);
      return;
    }
    setZone("rail");
    setFc(channelIndex);
  };

  // The guide's zone machine. Off the stack entirely while the full-screen player is up (which is
  // what the old `if (player.layout === "full") return` did by hand).
  //
  // Returning `true` claims the key. The sidebar / rail / mini-feed branches claim EVERY key,
  // matching the blanket `preventDefault()` those branches used to call before returning.
  useKeyLayer({
    id: "guide",
    priority: LAYER.BASE,
    active: player.layout !== "full",
    onKey(e) {
      // GREEN jumps straight to the mini feed from anywhere in the guide — the shortcut for
      // d-padding all the way up to it. Same destination as ▲ from the top row, minus the travel.
      if (e.key === "green" && player.layout === "mini" && !player.miniFocused) {
        player.focusMini();
        return true;
      }

      // Sidebar focused → its circles own the keys (Up/Down cycle, OK activates, Right/Back → grid).
      if (zone === "sidebar") {
        if (e.key === "back" || e.key === "right") setZone("grid");
        else if (e.key === "up") setSidebarSel((s) => Math.max(0, s - 1));
        else if (e.key === "down") setSidebarSel((s) => Math.min(sidebarItems.length - 1, s + 1));
        else if (e.key === "ok") activateSidebar(sidebarSel);
        return true;
      }

      // Rail focused (the channel cell) → the waypoint between grid and sidebar. Left opens the
      // sidebar; Up/Down browse channels rail-first; Right/Back returns to the grid; OK toggles
      // this channel's favorite (the heart shown beside the rail icon).
      if (zone === "rail") {
        if (e.key === "left") {
          setZone("sidebar");
          setSidebarSel(0);
        } else if (e.key === "back" || e.key === "right") {
          setZone("grid");
        } else if (e.key === "up") {
          setFc((c) => Math.max(0, c - 1));
        } else if (e.key === "down") {
          setFc((c) => Math.min(channels.length - 1, c + 1));
        } else if (e.key === "ok" && focusedChannel) {
          toggleFavorite(focusedChannel.id);
        }
        return true;
      }

      // Mini feed focused → its two buttons own the keys (Down returns to the grid; nothing sits
      // above it now that the nav pill is gone).
      if (player.miniFocused) {
        if (e.key === "back") player.stop();
        else if (e.key === "left") player.miniMove(-1);
        else if (e.key === "right") player.miniMove(1);
        else if (e.key === "ok") player.miniActivate();
        else if (e.key === "down") player.blurMini();
        return true;
      }

      // Back: a playing mini feed → stop the feed + session; otherwise exit the app.
      if (e.key === "back") {
        if (player.layout === "mini") player.stop();
        else (window as unknown as { webOS?: { platformBack?: () => void } }).webOS?.platformBack?.();
        return true;
      }

      const n = channels.length;
      if (!n) {
        // Empty grid (a filter with no channels, or a fresh install): there's nothing to browse,
        // but Left must still reach the sidebar so you're not trapped in an empty guide.
        if (e.key === "left") {
          setZone("sidebar");
          setSidebarSel(0);
          return true;
        }
        return false;
      }

      switch (e.key) {
        case "right":
          setFp((p) => Math.min((focusedChannel?.programs.length ?? 1) - 1, p + 1));
          return true;
        case "left":
          // Left off the leftmost program → the channel rail (favorite waypoint), then the sidebar.
          if (fp === 0) setZone("rail");
          else setFp((p) => Math.max(0, p - 1));
          return true;
        case "down": {
          const nc = Math.min(n - 1, fc + 1);
          setFc(nc);
          setFp(pickForChannel(nc));
          return true;
        }
        case "up": {
          // At the top row, Up docks into the mini feed if one's playing (nothing above it
          // otherwise — Guide/Settings/Account moved into the sidebar).
          if (fc === 0) {
            if (player.layout === "mini") player.focusMini();
            return true;
          }
          const nc = Math.max(0, fc - 1);
          setFc(nc);
          setFp(pickForChannel(nc));
          return true;
        }
        case "ok":
          if (focusedChannel) onTune(focusedChannel.id);
          return true;
      }
      return false;
    },
  });

  // The lens list can shrink under the focus (e.g. unfavoriting the channel you're on while in the
  // Favorites lens), which would leave `fc` pointing past the end.
  useEffect(() => {
    if (fc > 0 && fc >= channels.length) {
      const last = Math.max(0, channels.length - 1);
      setFc(last);
      fcRef.current = last;
    }
  }, [channels.length, fc]);

  // Keep the focused row in view (it may not be rendered yet, so go through the virtualizer).
  useEffect(() => {
    rowVirtualizer.scrollToIndex(fc, { align: "auto" });
  }, [fc, rowVirtualizer]);

  // Wheel / scroll-ring = D-pad up/down (one channel per tick, fast) instead of a slow
  // free-scroll. preventDefault needs a non-passive native listener.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (player.layout === "full" || zone !== "grid" || player.miniFocused) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      const nc = Math.min(channels.length - 1, Math.max(0, fcRef.current + dir));
      if (nc !== fcRef.current) {
        fcRef.current = nc; // advance synchronously so the next tick in the burst builds on it
        setFc(nc);
        setFp(pickForChannel(nc));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.length, player, zone]);

  return (
    <div
      style={{
        // tv-tauri seam: `absolute` (not tv-web's `fixed`) so the guide fills the app-viewport
        // BELOW the titlebar, and is the positioned ancestor for the inset floating sidebar.
        position: "absolute",
        inset: 0,
        // Transparent: the PlayerProvider's backdrop provides the navy (so the mini-feed slot can be a
        // real transparent cutout showing the mpv video behind the webview). tv-web paints C.bg here.
        background: "transparent",
        color: C.fg,
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      {/* Scrim behind the expanded sidebar — dims the guide so the sidebar reads as the focused
          layer. Sits BELOW the sidebar (z 25) and above the grid. The mini player is safe for free:
          it's a root-level fixed sibling (z 15) outside this stacking context, so nothing in here
          can paint over it.
          NO backdrop-filter, deliberately: MEASURED on the C2 (Chrome 108) — a full-screen blur
          tanks the frame rate even as a single blur(2px) layer, and even after removing the 20
          blurred circles. backdrop-filter is effectively unusable at this size on the panel; the
          plain translucent fill reads the same at 10 feet for none of the cost.
          AnimatePresence fades it out on the way back instead of snapping. */}
      <AnimatePresence>
        {zone === "sidebar" && (
          <motion.div
            key="sidebar-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 24,
              background: "rgba(6,10,20,0.55)",
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      {/* Left sidebar — it owns all the guide chrome now: Guide/Settings/Account plus the filter
          lenses (the old top segmented pill is retired). It's an absolute OVERLAY: the layout
          reserves only the sliver (the spacer below), and focusing it grows it OVER the guide, so
          nothing ever shifts or reflows. */}
      <GuideSidebar
        items={sidebarItems}
        expanded={zone === "sidebar"}
        focused={zone === "sidebar"}
        sel={sidebarSel}
        lens={lens}
        onActivate={activateSidebar}
      />
      {/* Reserves the sliver's space, since the sidebar itself is out of flow. */}
      <div style={{ width: SIDEBAR_SLIVER_W, flexShrink: 0 }} />
      <div style={{ width: colW, flexShrink: 0, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
      {channels.length > 0 && (
        <>
          {focusedChannel && focusedProgram ? (
            <FeaturedPanel channel={focusedChannel} program={focusedProgram} now={now} accent={channelTint(focusedChannel) ?? accentOf(fc)} slotRef={player.miniSlotRef} showSlot={player.layout !== "off"} />
          ) : (
            <div style={{ height: vw(600) }} />
          )}
          <TimeHeader T0={T0} railPx={railPx} laneX={laneX} />
        </>
      )}

      {/* Grid area — flex:1 so it fills all remaining height on any screen. */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {channels.length === 0 && (
          <GuideGhost
            T0={T0}
            railPx={railPx}
            rowPx={rowPx}
            laneW={laneW}
            laneX={laneX}
            variant={loading ? "loading" : errored ? "error" : "empty"}
            message={
              loading
                ? "Loading channels…"
                : errored
                  ? "Couldn't load the guide"
                  : lens.type === "favorites"
                    ? "No favorites yet"
                    : lens.type === "recents"
                      ? "Nothing watched yet"
                      : lens.type === "packages"
                        ? "No channels in this filter"
                        : "No channels yet"
            }
            sub={
              loading
                ? "Fetching your guide…"
                : errored
                  ? "Your server may be unreachable — press ◄ to open the sidebar and check Settings."
                  : lens.type === "favorites"
                    ? "Highlight a channel and press the heart to add it here."
                    : lens.type === "recents"
                      ? "Channels you tune into show up here, most recent first."
                      : lens.type === "packages"
                        ? "Try another filter, or press ◄ to open the sidebar and clear it."
                        : "Once channels are set up on your server, they'll appear here."
            }
          />
        )}
        <div
          ref={scrollRef}
          className="cg-grid-scroll"
          style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}
        >
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const c = channels[vi.index]!;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    // Row (non-program) click = FOCUS this channel's live program — never a stray tune.
                    // Tuning is deliberate: click a program to focus it, click it again to tune
                    // (handleProgramClick). Program cells stopPropagation, so they don't reach here.
                    if (player.miniFocused) return;
                    if (zone !== "grid") {
                      setZone("grid");
                      return;
                    }
                    setFc(vi.index);
                    setFp(liveProgramIndex(c.programs, now.getTime()));
                  }}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: rowPx, transform: `translateY(${vi.start}px)`, cursor: "pointer" }}
                >
                  <Row
                    channel={c}
                    // The channel's REAL tint (its own, else its package's); the index-derived
                    // palette is only a fallback for channels that carry no tint at all.
                    accent={channelTint(c) ?? accentOf(vi.index)}
                    // The rail stays lit while focus is ON the rail (it's the same channel row).
                    focused={vi.index === fc && (zone === "grid" || zone === "rail") && !player.miniFocused}
                    focusedProgramId={vi.index === fc && zone === "grid" && !player.miniFocused ? focusedProgram?.id : undefined}
                    railFocused={vi.index === fc && zone === "rail" && !player.miniFocused}
                    favorited={favoriteIds.has(c.id)}
                    onRailClick={() => handleRailClick(vi.index)}
                    onProgramClick={(id) => handleProgramClick(vi.index, id)}
                    now={now}
                    rowPx={rowPx}
                    railPx={railPx}
                    laneX={laneX}
                    laneW={laneW}
                    ppm={ppm}
                    minsFrom={minsFrom}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {channels.length > 0 && nowMins >= 0 && nowMins <= WINDOW_MIN && (
          <>
            {/* Vertical now-line hidden for now — the triangle marker alone reads the
                current time. Flip SHOW_NOW_LINE to bring the full line back. */}
            {SHOW_NOW_LINE && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: railPx + laneX(now),
                  width: 3,
                  background: C.now,
                  boxShadow: `0 0 12px ${C.now}`,
                  zIndex: 6,
                  pointerEvents: "none",
                }}
              />
            )}
            <div
              // A subtle downward triangle capping the line: its bottom point sits at
              // the very top of the line. Anchored at the line's center (left edge +1.5px
              // for the 3px line) and centered with translateX(-50%), so the apex lands
              // exactly on the midpoint regardless of the base width (no unit-mixing skew).
              style={{
                position: "absolute",
                top: -vwNum(width, 14),
                left: railPx + laneX(now) + 1.5,
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: `${vw(9)} solid transparent`,
                borderRight: `${vw(9)} solid transparent`,
                borderTop: `${vw(14)} solid ${C.now}`,
                filter: `drop-shadow(0 0 6px ${C.now})`,
                zIndex: 7,
                animation: "tvgPulse 2s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
          </>
        )}
      </div>
      </div>

      <style>{`@keyframes tvgPulse{0%,100%{opacity:1}50%{opacity:.55}}.cg-grid-scroll{scrollbar-width:none;-ms-overflow-style:none}.cg-grid-scroll::-webkit-scrollbar{display:none}`}</style>
    </div>
  );
}

/** spec px → device px at the current width (for exact left-offsets). */
const vwNum = (width: number, px: number) => (px / DESIGN_W) * width;

/** A single static (non-animated) placeholder block — the guide's skeleton tone. Animation is
 *  deliberately omitted (measured: shimmering ~50 blocks tanks the C2's frame rate, same lesson as
 *  the admin guide's `animate={false}` skeletons). */
function GBlock({
  w,
  h,
  r = vw(10),
  style,
}: {
  w: number | string;
  h: number | string;
  r?: number | string;
  style?: React.CSSProperties;
}) {
  return <div style={{ width: w, height: h, borderRadius: r, background: "rgba(148,163,184,0.09)", flexShrink: 0, ...style }} />;
}

// Program-block widths per ghost row (fractions of the lane), varied so it reads like a real grid.
// Each row's fractions SUM TO >1 so the last block runs PAST the right edge (clipped by the lane's
// overflow) — exactly like a real program still airing beyond the visible window, so the ghosted rows
// reach the edge instead of stopping short.
const GHOST_ROWS = [
  [0.3, 0.34, 0.5],
  [0.5, 0.28, 0.42],
  [0.22, 0.46, 0.5],
  [0.4, 0.3, 0.48],
  [0.26, 0.38, 0.28, 0.35],
  [0.55, 0.32, 0.38],
];

/** How many tiled skeleton rows the ghost lays down — more than any screen shows, clipped by overflow,
 *  so the ghosted grid always reaches the bottom edge. */
const GHOST_ROW_COUNT = 16;

/**
 * The guide's OWN structure rendered as static skeletons (featured panel + the REAL time axis + tiled
 * program rows), behind a centered message card. Deliberately mirrors the loaded layout — the same
 * `fv()`-scaled featured blocks, the same `TimeHeader`, rail circle+number+name and lane program
 * blocks — so it reads as "the guide, about to appear" and doesn't jump when the data lands (the
 * apps/web `/guide` treatment, ported to the 10-foot layout). Shown while the guide is LOADING, on a
 * fetch ERROR, or when the (filtered) channel list is EMPTY (fresh install / favorites / recents /
 * package filter with nothing in it). The D-pad can still Left back to the sidebar (see the empty-grid
 * key handler), so the user is never trapped.
 */
function GuideGhost({
  T0,
  railPx,
  rowPx,
  laneW,
  laneX,
  variant,
  message,
  sub,
}: {
  T0: Date;
  railPx: number;
  rowPx: number;
  laneW: number;
  laneX: (iso: string | Date) => number;
  variant: "loading" | "error" | "empty";
  message: string;
  sub?: string;
}) {
  const fv = (px: number) => vw(px * FEATURE_SCALE);
  const Icon = variant === "loading" ? Loader2 : variant === "error" ? WifiOff : Tv;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Featured-panel skeleton — mirrors FeaturedPanel's blocks/paddings so it lands where the real
          panel will (header icon+number+name · genre · divider · title+badges · meta · summary ·
          time/status · progress). */}
      <div style={{ display: "flex", gap: fv(56), alignItems: "flex-start", padding: `${fv(40)} ${fv(64)} 0`, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: fv(22) }}>
            <GBlock w={fv(64)} h={fv(64)} r="50%" />
            <GBlock w={fv(64)} h={fv(44)} />
            <GBlock w={fv(340)} h={fv(44)} style={{ maxWidth: "50%" }} />
          </div>
          <GBlock w={fv(280)} h={fv(30)} style={{ marginTop: fv(14), maxWidth: "40%" }} />
          <div style={{ height: 1, background: C.border, margin: `${fv(22)} 0 ${fv(26)}` }} />
          <div style={{ display: "flex", alignItems: "center", gap: fv(28) }}>
            <GBlock w={fv(760)} h={fv(60)} style={{ flex: 1, maxWidth: "70%" }} />
            <div style={{ display: "flex", gap: fv(14), flexShrink: 0 }}>
              <GBlock w={fv(70)} h={fv(44)} />
              <GBlock w={fv(90)} h={fv(44)} />
            </div>
          </div>
          <GBlock w={fv(240)} h={fv(34)} style={{ marginTop: fv(22) }} />
          <GBlock w="100%" h={fv(34)} style={{ marginTop: fv(22) }} />
          <GBlock w="82%" h={fv(34)} style={{ marginTop: fv(12) }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: fv(26) }}>
            <GBlock w={fv(220)} h={fv(34)} />
            <GBlock w={fv(120)} h={fv(34)} />
          </div>
          <GBlock w="100%" h={fv(8)} r={999} style={{ marginTop: fv(16) }} />
        </div>
      </div>

      {/* The real time axis — it needs no channels, and anchoring the skeleton to it looks intentional. */}
      <TimeHeader T0={T0} railPx={railPx} laneX={laneX} />

      {/* Tiled skeleton rows, with the centered message card floating over them. */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {Array.from({ length: GHOST_ROW_COUNT }, (_, i) => {
          const pattern = GHOST_ROWS[i % GHOST_ROWS.length]!;
          let acc = 0;
          return (
            <div key={i} style={{ display: "flex", height: rowPx, borderTop: `1px solid ${C.rowBorder}` }}>
              {/* rail: channel circle + number (top), name (bottom) — matches Row's rail */}
              <div style={{ width: railPx, flexShrink: 0, boxSizing: "border-box", padding: `${vw(18)} ${vw(20)}`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <GBlock w={vw(64 * FEATURE_SCALE)} h={vw(64 * FEATURE_SCALE)} r="50%" />
                  <GBlock w={vw(40)} h={vw(30)} />
                </div>
                <GBlock w="82%" h={vw(24)} />
              </div>
              {/* lane: tiled program blocks (left-accumulating fractions of the lane) */}
              <div style={{ position: "relative", flex: 1, overflow: "hidden" }}>
                {pattern.map((frac, j) => {
                  const left = acc * laneW + (acc === 0 ? 0 : 3);
                  const width = frac * laneW - 6;
                  acc += frac;
                  if (width < MIN_VISIBLE_PX) return null;
                  return <GBlock key={j} w={width} h={`calc(100% - ${vw(12)})`} style={{ position: "absolute", top: vw(6), left }} />;
                })}
              </div>
            </div>
          );
        })}

        {/* Centered message card, floating over the ghosted grid (apps/web treatment). */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: vw(48), pointerEvents: "none" }}>
          <div
            style={{
              pointerEvents: "auto",
              maxWidth: vw(1100),
              textAlign: "center",
              background: "rgba(6,10,20,0.82)",
              border: `1px solid ${C.border}`,
              borderRadius: vw(28),
              padding: `${vw(40)} ${vw(60)}`,
              backdropFilter: "blur(3px)",
              WebkitBackdropFilter: "blur(3px)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            }}
          >
            <Icon className={variant === "loading" ? "animate-spin" : undefined} color="#94a3b8" strokeWidth={1.5} style={{ width: vw(56), height: vw(56), margin: "0 auto" }} />
            <div style={{ fontSize: vw(48), fontWeight: 700, letterSpacing: "-0.5px", color: "#e2e8f0", marginTop: vw(16) }}>{message}</div>
            {sub && <div style={{ marginTop: vw(14), fontSize: vw(30), color: "#94a3b8", lineHeight: 1.45 }}>{sub}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeHeader({
  T0,
  railPx,
  laneX,
}: {
  T0: Date;
  railPx: number;
  laneX: (iso: string | Date) => number;
}) {
  const ticks = Array.from({ length: Math.ceil(WINDOW_MIN / 30) + 1 }, (_, i) => new Date(T0.getTime() + i * 30 * MIN));
  return (
    // marginTop = breathing room below the featured card (they read as crowded when it's tight);
    // marginBottom = clearance for the now-marker triangle that caps the grid.
    <div style={{ position: "relative", height: vw(52), flexShrink: 0, marginTop: vw(56), marginBottom: vw(20) }}>
      {/* Left-aligned with the channel rail content below (the rail cell pads vw(20) on the left). */}
      <div style={{ position: "absolute", left: vw(20), top: vw(6), fontSize: vw(32), fontWeight: 600, color: "#e6eaf1" }}>
        {fmtDay(T0)}
      </div>
      <div style={{ position: "absolute", left: railPx, right: 0, top: 0, bottom: 0 }}>
        {ticks.map((t, i) => (
          <div
            key={i}
            style={{ position: "absolute", left: laneX(t), top: vw(6), fontSize: vw(32), fontWeight: 600, color: "#c3c9d4", whiteSpace: "nowrap" }}
          >
            {fmtTime(t)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({
  channel,
  accent,
  focused,
  focusedProgramId,
  railFocused,
  favorited,
  onRailClick,
  onProgramClick,
  now,
  rowPx,
  railPx,
  laneX,
  laneW,
  ppm,
  minsFrom,
}: {
  channel: GuideGridChannel;
  accent: string;
  focused: boolean;
  focusedProgramId?: string;
  /** Focus is on this channel's RAIL cell → reveal the favorite heart. */
  railFocused: boolean;
  favorited: boolean;
  /** Mouse: click the rail to focus it (first click) or toggle favorite (second click, already focused). */
  onRailClick: () => void;
  /** Mouse: click a program to focus it (first click) or tune it (second click, already focused). */
  onProgramClick: (programId: string) => void;
  now: Date;
  rowPx: number;
  railPx: number;
  laneX: (iso: string | Date) => number;
  laneW: number;
  ppm: number;
  minsFrom: (iso: string | Date) => number;
}) {
  return (
    <div
      style={{
        position: "relative",
        height: rowPx,
        boxSizing: "border-box",
        display: "flex",
        borderTop: `1px solid ${C.rowBorder}`,
        background: "transparent",
      }}
    >
      <div
        // Click the rail to FOCUS it (first click), or toggle favorite (second click, already focused)
        // — the two-step mirror of program click-to-focus/click-to-tune. stopPropagation so it doesn't
        // fall through to the row's focus-live-program handler.
        onClick={(e) => {
          e.stopPropagation();
          onRailClick();
        }}
        style={{
          // Fixed px (viewport-derived), NOT a % of the row — so the rail keeps its width when the
          // sidebar expands and the column narrows; the time lane absorbs the difference.
          width: railPx,
          flexShrink: 0,
          padding: `${vw(18)} ${vw(20)}`,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: focused ? hexA(accent, 0.12) : "transparent",
          boxShadow: focused ? `inset 4px 0 0 ${accent}` : "none",
          cursor: "pointer",
        }}
      >
        {/* top: the tinted channel-icon circle (left) + channel number (right).
            The circle is the SINGLE favorite affordance now — matched to the featured panel's
            tile (size / accent ring / tint), and it doubles as the favorite toggle:
              • rail focused  → a circular blue focus ring + the circle's glyph becomes a HEART
                                (filled red if favorited, white outline if not); OK/click toggles.
              • favorited, not focused → the channel glyph, plus a small red heart badge tucked
                                into the bottom-right so favorites are spottable while scanning.
              • otherwise     → just the channel glyph.
            Number is align-items:flex-start so it stays put no matter how tall the circle is. */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          {/* role=button, not <button>: on the C2's Chrome 108 `display:flex` on a real <button>
              mis-centers its child, so a div is used for the centered glyph/heart. Click routes through
              the rail two-step (onRailClick): first click focuses the rail (the glyph becomes the
              heart), a second click on the focused rail toggles favorite — matching a keyboard OK. */}
          <div
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onRailClick();
            }}
            title={railFocused ? (favorited ? "Remove favorite" : "Add favorite") : "Focus channel"}
            style={{
              position: "relative",
              // Identical to the featured panel's tile: it renders fv(64)=vw(64*FEATURE_SCALE),
              // glyph fv(34). Expressed the same way so the two stay locked together.
              width: vw(64 * FEATURE_SCALE),
              height: vw(64 * FEATURE_SCALE),
              borderRadius: "50%",
              background: hexA(accent, 0.2),
              border: `1px solid ${hexA(accent, 0.35)}`,
              color: accent,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: vw(34 * FEATURE_SCALE),
              cursor: "pointer",
              // Focus ring lives on the circle now (moved off the old heart button). An outline
              // takes no layout space and sits outside the border, so it never nudges anything.
              outline: railFocused ? `${vw(3)} solid ${C.ring}` : "none",
              outlineOffset: railFocused ? vw(2) : 0,
            }}
          >
            {railFocused ? (
              // Focused → the circle asks "favorite?": filled red when it is, white outline when not.
              <Heart size="1em" fill={favorited ? C.fav : "none"} color={favorited ? C.fav : "#c3c9d4"} />
            ) : (
              (() => {
                const Icon = channelIcon(channel.icon ?? channel.package?.icon);
                return <Icon size="1em" />;
              })()
            )}
            {/* Favorite indicator — only when favorited AND not focused (focused already shows the
                filled heart). Just the red heart tucked into the bottom-right corner, no disc; a
                soft drop-shadow keeps it legible where it overlaps the tint edge. */}
            {favorited && !railFocused && (
              <span
                style={{
                  position: "absolute",
                  right: vw(-4),
                  bottom: vw(-4),
                  display: "flex",
                  fontSize: vw(22),
                  lineHeight: 1,
                  filter: `drop-shadow(0 ${vw(1)} ${vw(2)} rgba(0,0,0,0.6))`,
                }}
              >
                <Heart size="1em" fill={C.fav} color={C.fav} />
              </span>
            )}
          </div>
          {/* Bright only on the highlighted row; muted otherwise, so the focused channel's
              number stands out down the rail instead of every number competing at full weight. */}
          <span style={{ fontSize: vw(34), lineHeight: 1, fontWeight: 700, color: focused ? "#e6eaf1" : C.mutedFg }}>
            {channel.number}
          </span>
        </div>
        {/* bottom: full name, left-aligned, clamped to 2 lines */}
        <div
          style={{
            fontSize: vw(23),
            color: C.mutedFg,
            lineHeight: 1.2,
            textAlign: "left",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {channel.name}
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, height: rowPx, overflow: "hidden" }}>
        {channel.programs
          .filter((p) => {
            const start = minsFrom(p.startsAt);
            const end = start + p.durationSeconds / 60;
            return end > 0 && start < WINDOW_MIN;
          })
          .map((p) => {
            const selected = p.id === focusedProgramId;
            // Only the program that's actually airing right now gets the channel-accent
            // bar (a broadcast "on air" cue) — drawn as a separate inset element below,
            // not a border, so it never depends on focus and isn't curved by the radius.
            const startMs = new Date(p.startsAt).getTime();
            const live = now.getTime() >= startMs && now.getTime() < startMs + p.durationSeconds * 1000;
            // A program that started before the grid's left edge (T0) would render
            // way off-screen to the left, hiding its title. Clamp its left to the rail
            // and shrink the width by the clipped amount — leaving the same tiny 6px
            // gap the blocks have between each other, so it isn't butted flush.
            const rawLeft = laneX(p.startsAt);
            const rawRight = rawLeft + Math.max(laneW * 0.02, (p.durationSeconds / 60) * ppm) - 6;
            const left = rawLeft < 0 ? 6 : rawLeft;
            const width = rawRight - left;
            // For the live program, how far the live point is across the *rendered* card
            // (accounts for cards clamped to the rail) — drives the two-tone progress fill.
            const fillPct = Math.max(0, Math.min(100, ((laneX(now) - left) / width) * 100));
            // Two-tone fill: strong tint on one side of the live point, weak on the other —
            // PROGRESS_FILL_ELAPSED_STRONGER picks whether elapsed or remaining is the strong side.
            const [fillA, fillB] = PROGRESS_FILL_ELAPSED_STRONGER
              ? [hexA(accent, 0.32), hexA(accent, 0.1)]
              : [hexA(accent, 0.1), hexA(accent, 0.32)];
            const liveFill = `linear-gradient(90deg, ${fillA} ${fillPct}%, ${fillB} ${fillPct}%)`;
            return (
              <div
                key={p.id}
                // Click to focus this program (first click → details in the featured panel); a second
                // click on the already-focused program tunes the channel. stopPropagation so the
                // row-level click (focus the channel's live program) doesn't also fire.
                onClick={(e) => {
                  e.stopPropagation();
                  onProgramClick(p.id);
                }}
                style={{
                  position: "absolute",
                  top: vw(6),
                  left,
                  width,
                  height: `calc(100% - ${vw(12)})`,
                  cursor: "pointer",
                  // Padding lives on the inner wrapper, NOT here: with box-sizing:border-box a
                  // block narrower than the horizontal padding can't shrink below it, so a
                  // clamped sliver would floor to the padding width (~42px) and overlap its
                  // neighbor. The block stays its exact geometric `width`; overflow clips the pad.
                  boxSizing: "border-box",
                  overflow: "hidden",
                  borderRadius: 8,
                  // Constant 1px border + an inset focus outline, so highlighting never
                  // changes the border width (which would nudge the layout by a pixel).
                  border: `1px solid ${C.cellBorder}`,
                  outline: selected ? `2px solid ${C.ring}` : "none",
                  outlineOffset: selected ? -2 : 0,
                  // Only the currently-airing program carries the channel tint — a two-tone
                  // progress fill: stronger tint up to the live point, weaker tint for the
                  // not-yet-aired remainder. Every other program gets a neutral fill and shows
                  // focus via the outline only (background is unaffected by selection).
                  background: live ? liveFill : "rgba(148,163,184,0.05)",
                  boxShadow: selected ? "0 12px 30px rgba(0,0,0,0.5)" : "none",
                  zIndex: selected ? 4 : 1,
                  transition: "background .12s",
                }}
              >
                {live && (
                  <div
                    // The "on air" accent line: a separate inset element (not a border),
                    // hugging the left edge and clear of the top/bottom radius.
                    style={{
                      position: "absolute",
                      left: 3,
                      top: 10,
                      bottom: 10,
                      width: 3,
                      borderRadius: 4,
                      background: accent,
                      zIndex: 2,
                    }}
                  />
                )}
                <div style={{ height: "100%", padding: `${vw(20)} ${vw(20)} 0`, boxSizing: "border-box" }}>
                  <div style={{ fontSize: vw(34), fontWeight: 600, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.guide.showTitle ?? p.guide.title}
                  </div>
                  <div style={{ marginTop: vw(12), fontSize: vw(26), color: C.mutedFg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {subLine(p.guide)}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function FeaturedPanel({
  channel,
  program,
  now,
  accent,
  slotRef,
  showSlot,
}: {
  channel: GuideGridChannel;
  program: GuideGridProgram;
  now: Date;
  accent: string;
  slotRef?: React.RefObject<HTMLDivElement | null>;
  showSlot?: boolean;
}) {
  const g = program.guide;
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
  // For an episode: lead with the SHOW name, then "S1, E2 · Episode Title".
  // For a movie: just the title.
  const isEpisode = !!g.showTitle && g.season != null && g.episode != null;
  // Featured panel scales off width but is uniformly shrunk (FEATURE_SCALE) so it
  // doesn't dominate the vertical space — the grid below gets the majority.
  const fv = (px: number) => vw(px * FEATURE_SCALE);
  const badge: React.CSSProperties = { fontSize: fv(30), fontWeight: 700, padding: `${fv(6)} ${fv(16)}`, borderRadius: 8 };

  return (
    <div style={{ display: "flex", gap: fv(56), alignItems: "flex-start", padding: `${fv(40)} ${fv(64)} 0`, flexShrink: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: fv(22) }}>
          {/* Tinted icon tile in the channel's accent (own or inherited), matching the rail. */}
          <span
            style={{
              width: fv(64),
              height: fv(64),
              borderRadius: "50%",
              background: hexA(accent, 0.2),
              border: `1px solid ${hexA(accent, 0.35)}`,
              color: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: fv(34),
              flexShrink: 0,
            }}
          >
            {(() => {
              const Icon = channelIcon(channel.icon ?? channel.package?.icon);
              return <Icon size="1em" />;
            })()}
          </span>
          {/* Number + name carry a muted tint of the channel's accent (name a touch brighter). */}
          <span style={{ fontSize: fv(44), fontWeight: 700, color: hexA(accent, 0.75) }}>{channel.number}</span>
          <span style={{ fontSize: fv(44), fontWeight: 700, color: accent, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {channel.name}
          </span>
        </div>
        {(g.genres?.length || g.tagline) && (
          <div style={{ marginTop: fv(14), fontSize: fv(30), color: "#64748b" }}>
            {[g.genres?.slice(0, 2).join(" · "), g.tagline].filter(Boolean).join(" · ")}
          </div>
        )}
        <div style={{ height: 1, background: C.border, margin: `${fv(22)} 0 ${fv(26)}` }} />

        <div style={{ display: "flex", alignItems: "center", gap: fv(28) }}>
          <div style={{ flex: 1, fontSize: fv(60), fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1.05, minWidth: 0 }}>
            {isEpisode ? g.showTitle : g.title}
            {isEpisode && (
              <span style={{ fontWeight: 400, color: "#c3c9d4" }}>
                {" "}
                S{g.season}, E{g.episode}
                {g.title ? ` · ${g.title}` : ""}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: fv(14), flexShrink: 0 }}>
            {is4K(g.resolution) ? (
              <span style={{ ...badge, background: BADGE_GRAD.res, color: "#06222a" }}>4K</span>
            ) : isHD(g.resolution) ? (
              <span style={{ ...badge, background: BADGE_GRAD.res, color: "#06222a" }}>HD</span>
            ) : null}
            {g.hdr && (
              <span style={{ ...badge, background: BADGE_GRAD.hdr, color: "#2a1e00" }}>
                {g.hdr === "Dolby Vision" ? "DV" : "HDR"}
              </span>
            )}
            {audio && <span style={{ ...badge, background: BADGE_GRAD.audio, color: "#dfe4ec" }}>{audio}</span>}
            {g.dynamicAudio && (
              <span style={{ ...badge, background: BADGE_GRAD.audio, color: "#dfe4ec" }}>
                {g.dynamicAudio === "Atmos" ? "ATMOS" : g.dynamicAudio}
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: fv(22), display: "flex", alignItems: "center", gap: fv(16), fontSize: fv(34), color: "#c3c9d4" }}>
          {g.year && <span>{g.year}</span>}
          {g.year && g.contentRating && <span style={{ color: "#475569" }}>·</span>}
          {g.contentRating && <span>{g.contentRating}</span>}
          {g.criticRating != null && (
            <>
              <span style={{ color: "#475569" }}>·</span>
              <Star size="1em" color={C.star} fill={C.star} />
              <span>{g.criticRating.toFixed(1)}</span>
            </>
          )}
        </div>

        {/* Always reserve two lines (the max) so the panel height doesn't jump
            between a 1-line and 2-line (or missing) summary. Spans the full column
            width (no maxWidth cap) so it uses the room left beside the mini feed. */}
        <div style={{ marginTop: fv(22), fontSize: fv(36), lineHeight: 1.4, minHeight: fv(36 * 1.4 * 2), color: "#c9cfda", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {g.summary ?? ""}
        </div>

        <div style={{ marginTop: fv(26), display: "flex", justifyContent: "space-between", fontSize: fv(34), color: "#c3c9d4" }}>
          <span>
            {fmtTime(start)} - {fmtTime(end)}
          </span>
          <span style={{ color: "#e6eaf1" }}>{status}</span>
        </div>
        <div style={{ marginTop: fv(16), height: fv(8), borderRadius: 999, background: "rgba(148,163,184,0.18)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: accent, width: `${pct}%`, transition: "width .2s" }} />
        </div>
      </div>

      {/* The slot the persistent mini feed docks into — only present while a feed is
          active, so with nothing playing the left content spans the full width (no empty
          gap). The player (player-context.tsx) overlays the live video here in `mini`.
          Fixed width + `alignSelf: stretch` FILLS the panel's height (bottom-flush — the panel
          has no bottom padding); the width is tuned so the filled height lands ~16:9. (Deriving
          width from the stretched height via `aspect-ratio` overflowed off-screen on Chrome 108
          / the webOS simulator, so we use a plain fixed width instead.) */}
      {showSlot && <div ref={slotRef} style={{ alignSelf: "stretch", width: fv(970), borderRadius: 14, flexShrink: 0 }} />}
    </div>
  );
}
