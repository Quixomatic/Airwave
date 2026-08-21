import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../lib/api";
import { useChannels } from "../../hooks/use-channels";
import { useGuide } from "../../hooks/use-guide";
import { useFullBleed } from "../../lib/full-bleed";
import { BumperCard } from "./bumper-card";
import { ChannelNumberEntry } from "./channel-number-entry";
import { accentForChannel, FullChrome } from "./full-chrome";
import { mpv, mpvEvents } from "./mpv";
import { Ctx, type Layout, type PlayerCtx } from "./player-ctx";
import { useTvPlayer } from "./use-tv-player";

export { usePlayer } from "./player-ctx";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * The persistent player (Phase 4.4). It lives ABOVE the routes (mounted in `_auth/route`) so playback
 * survives guide↔player navigation, holds `useTvPlayer` (the DVR clock), and drives the full-window
 * Rust mpv surface by LAYOUT:
 *  - `full`  → `mpv.fillWindow()` + the `FullChrome` overlay; the guide is hidden (`opacity:0`) so the
 *              video shows edge-to-edge.
 *  - `mini`  → `mpv.setRegion(slotRect)` positions the video into the guide's featured-panel slot, and
 *              a navy backdrop with a rounded HOLE at that rect shows only the video there (the rest of
 *              mpv's surface is covered by the opaque backdrop). This is the mini feed.
 *  - `off`   → full navy backdrop; mpv idle.
 * The backdrop provides the navy so the guide root can be transparent (the slot is a real cutout).
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("off");
  const [miniFocused, setMiniFocused] = useState(false);
  const [miniSel, setMiniSel] = useState<0 | 1>(0);
  const [miniRect, setMiniRect] = useState<Rect | null>(null);
  const miniSlotRef = useRef<HTMLDivElement | null>(null);

  const [quality, setQuality] = useState("original");
  const [audioStreamId, setAudioStreamId] = useState<string | undefined>(undefined);
  const [subtitleStreamId, setSubtitleStreamId] = useState<string | undefined>(undefined);

  const tvPlayer = useTvPlayer(channelId, { quality, audioStreamId, subtitleStreamId }, layout === "full");

  // The mini feed docks into the GUIDE's featured-panel slot, which only exists on the guide route. On
  // any other authed route (settings, diagnostic) that slot is gone, so we hide the mini overlays and
  // let the route's own opaque page cover the (still-playing) full-window mpv surface behind it. The
  // full player is route-independent (it fills the window), so this only gates the mini layout.
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onGuide = pathname === "/";
  const showMini = layout === "mini" && onGuide;

  const tune = useCallback((id: string) => {
    setChannelId(id);
    setLayout("full");
    setMiniFocused(false);
  }, []);
  const goFull = useCallback(() => setLayout("full"), []);
  const goMini = useCallback(() => {
    setLayout("mini");
    setMiniFocused(false);
  }, []);
  const stop = useCallback(() => {
    setChannelId(null);
    setLayout("off");
    setMiniFocused(false);
  }, []);
  const focusMini = useCallback(() => setMiniFocused(true), []);
  const blurMini = useCallback(() => setMiniFocused(false), []);
  const miniMove = useCallback((d: -1 | 1) => setMiniSel((s) => (s + d < 0 ? 0 : s + d > 1 ? 1 : ((s + d) as 0 | 1))), []);
  const miniActivate = useCallback(() => {
    if (miniSel === 0) goFull();
    else stop();
  }, [miniSel, goFull, stop]);

  // Remote channel navigation (CH▲/▼ — desktop `]`/`[`): step the ORDERED lineup by one, clamped at
  // the ends (no wrap), behind an IN-FLIGHT LOCK. A press fires immediately and blocks any further
  // channel change until the new channel has actually loaded (the mpv `loaded` event releases the
  // lock; a 5s timeout backs it out if a channel errors and never plays) — James's spec: NOT a
  // debounce, a real lock so rapid presses don't thrash the reload. Faithful port of tv-web.
  const { data: channels } = useChannels();
  const lineup = useMemo(
    () => [...(channels ?? [])].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    [channels],
  );
  const lineupRef = useRef(lineup);
  lineupRef.current = lineup;
  const playingRef = useRef(channelId);
  playingRef.current = channelId;
  const chLockRef = useRef(false);
  const chLockTimer = useRef(0);
  const channelStep = useCallback(
    (dir: 1 | -1) => {
      if (chLockRef.current) return; // a change is still in flight — ignore
      const list = lineupRef.current;
      const idx = list.findIndex((c) => c.id === playingRef.current);
      if (idx < 0) return; // nothing playing → CH▲/▼ is a while-watching gesture, so no-op
      const target = list[idx + dir];
      if (!target) return; // clamp at the first / last channel (no wrap)
      chLockRef.current = true;
      window.clearTimeout(chLockTimer.current);
      chLockTimer.current = window.setTimeout(() => {
        chLockRef.current = false;
      }, 5000);
      tune(target.id);
    },
    [tune],
  );

  // Release the CH lock the instant the new channel's media loads in mpv (or on the timeout backstop).
  useEffect(() => {
    const un = mpvEvents.onLoaded(() => {
      chLockRef.current = false;
      window.clearTimeout(chLockTimer.current);
    });
    return () => {
      void un.then((f) => f());
    };
  }, []);

  // Read the featured-panel slot's rect and position mpv into it (+ track it for the backdrop hole).
  const syncMini = useCallback(() => {
    const el = miniSlotRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const rect = { x: r.x, y: r.y, w: r.width, h: r.height };
    setMiniRect(rect);
    void mpv.setRegion(rect.x, rect.y, rect.w, rect.h, window.innerWidth, window.innerHeight);
  }, []);

  useEffect(() => {
    if (layout === "full") {
      void mpv.fillWindow();
    } else if (layout === "mini" && onGuide) {
      // Re-runs when returning to the guide (onGuide flips true) so mpv re-docks into the slot.
      syncMini();
    } else if (layout === "off") {
      setMiniRect(null);
      void mpv.fillWindow(); // reset margins (mpv is stopped in `off`)
    }
    // layout === "mini" && !onGuide: leave mpv where it is (covered by the route's opaque page).
  }, [layout, onGuide, syncMini]);

  // Keep the mini feed glued to the slot as the window/guide reflows.
  useEffect(() => {
    if (layout !== "mini") return;
    const on = () => syncMini();
    window.addEventListener("resize", on);
    // The slot may not be laid out the instant we enter mini — resync a couple of times.
    const timers = [setTimeout(syncMini, 60), setTimeout(syncMini, 250), setTimeout(syncMini, 600)];
    return () => {
      window.removeEventListener("resize", on);
      timers.forEach(clearTimeout);
    };
  }, [layout, syncMini]);

  const value = useMemo<PlayerCtx>(
    () => ({
      activeChannelId: channelId,
      playingChannelId: channelId,
      layout,
      miniFocused,
      miniSel,
      miniSlotRef,
      tune,
      goFull,
      goMini,
      stop,
      focusMini,
      blurMini,
      miniMove,
      miniActivate,
      channelStep,
    }),
    [channelId, layout, miniFocused, miniSel, tune, goFull, goMini, stop, focusMini, blurMini, miniMove, miniActivate, channelStep],
  );

  // The channel (for the chip) + the quality ladder, for the FullChrome overlay.
  const { data: guide } = useGuide();
  const channel = useMemo(() => guide?.channels.find((c) => c.id === channelId), [guide, channelId]);
  const accent = accentForChannel(channel);
  const { data: qData } = useQuery({ queryKey: ["qualities"], queryFn: () => api.qualities() });

  const hidden = layout === "full";

  return (
    <Ctx.Provider value={value}>
      {/* Global channel-number entry + CH▲/▼ (armed on the "/" route: guide + player + mini feed). */}
      <ChannelNumberEntry />

      {/* Backdrop behind the guide: full navy (off / mini-but-off-guide), a rounded HOLE at the slot
          (mini ON the guide), nothing (full). */}
      {layout !== "full" &&
        (showMini && miniRect ? (
          <div
            style={{
              position: "fixed",
              left: miniRect.x,
              top: miniRect.y,
              width: miniRect.w,
              height: miniRect.h,
              borderRadius: 14,
              boxShadow: "0 0 0 100vmax #060a14",
              zIndex: 0,
              pointerEvents: "none",
            }}
          />
        ) : (
          <div style={{ position: "fixed", inset: 0, background: "#060a14", zIndex: 0, pointerEvents: "none" }} />
        ))}

      {/* The routed content (guide). Hidden when full so mpv fills the window. */}
      <div style={{ position: "absolute", inset: 0, opacity: hidden ? 0 : 1, pointerEvents: hidden ? "none" : "auto" }}>
        {children}
      </div>

      {/* Mini feed: the compact "Up next" BumperCard during a bumper (the docked video is paused on the
          last frame), pinned over the slot — under the controls so hover still reveals them. */}
      {showMini && miniRect && channelId && tvPlayer.status.state === "bumper" && tvPlayer.status.guide && (
        <div style={{ position: "fixed", left: miniRect.x, top: miniRect.y, width: miniRect.w, height: miniRect.h, borderRadius: 14, overflow: "hidden", zIndex: 4 }}>
          <BumperCard
            channelId={channelId}
            guide={tvPlayer.status.guide}
            remaining={tvPlayer.status.bumperRemaining}
            total={tvPlayer.status.bumperTotal}
            accent={accent}
            compact
            paused={tvPlayer.status.paused}
          />
        </div>
      )}

      {/* Mini feed controls — over the slot; a footer hint when idle, the two buttons on hover or when
          navigated into (`miniFocused`). */}
      {showMini && miniRect && (
        <MiniControls rect={miniRect} focused={miniFocused} sel={miniSel} accent={accent} onExpand={goFull} onClose={stop} />
      )}

      {layout === "full" && channelId && (
        <FullOverlay
          channelId={channelId}
          channel={channel}
          player={tvPlayer}
          quality={quality}
          audioStreamId={audioStreamId}
          subtitleStreamId={subtitleStreamId}
          qualities={qData?.qualities ?? []}
          onSelectQuality={setQuality}
          onSelectAudio={(id) => setAudioStreamId(id || undefined)}
          onSelectSub={(id) => setSubtitleStreamId(id === "off" ? undefined : id || undefined)}
          onBack={goMini}
          onTune={tune}
        />
      )}
    </Ctx.Provider>
  );
}

/** The fullscreen chrome overlay — a separate component so `useFullBleed` runs only while full. */
function FullOverlay(props: React.ComponentProps<typeof FullChrome>) {
  useFullBleed(); // edge-to-edge + transparent titlebar while the full player is up
  return (
    <div className="fixed inset-0 z-[60] text-white">
      <FullChrome {...props} />
    </div>
  );
}

/**
 * The mini-feed overlay, pinned over the slot rect. Idle → a footer hint ("↑ or hover for controls");
 * hovered OR navigated-into (`focused`) → the two buttons (Full screen / Close). Transparent when idle
 * (the video shows through) but pointer-events:auto so it catches the hover.
 */
function MiniControls({
  rect,
  focused,
  sel,
  accent,
  onExpand,
  onClose,
}: {
  rect: Rect;
  focused: boolean;
  sel: 0 | 1;
  accent: string;
  onExpand: () => void;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const show = focused || hovered;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "fixed", left: rect.x, top: rect.y, width: rect.w, height: rect.h, borderRadius: 14, overflow: "hidden", zIndex: 5, pointerEvents: "auto" }}
    >
      <AnimatePresence>
        {show && (
          <motion.div
            key="buttons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 22, background: "rgba(6,10,20,0.55)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
          >
            <MiniButton icon={<Maximize2 size={24} />} label="Full screen" selected={focused && sel === 0} accent={accent} onClick={onExpand} />
            <MiniButton icon={<X size={24} />} label="Close" selected={focused && sel === 1} accent={accent} onClick={onClose} />
          </motion.div>
        )}
        {!show && (
          <motion.div
            key="hint"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "7px 0 8px", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)", background: "linear-gradient(to top, rgba(6,10,20,0.82), rgba(6,10,20,0))", pointerEvents: "none" }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 20, height: 18, padding: "0 5px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.35)", fontSize: 12, lineHeight: 1 }}>↑</span>
            or hover for controls
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A circle glass button with a label below — matches tv-web's mini-feed MiniButton. */
function MiniButton({ icon, label, selected, accent, onClick }: { icon: ReactNode; label: string; selected: boolean; accent: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, border: "none", background: "transparent", cursor: "pointer", color: selected ? "#f1f5f9" : "#94a3b8" }}
    >
      <span
        style={{
          width: 54,
          height: 54,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: selected ? accent : "rgba(30,41,59,0.85)",
          color: selected ? "#06121f" : "#dfe4ec",
          boxShadow: selected ? `0 0 0 3px ${accent}66` : "none",
          transition: "all .12s",
        }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
    </button>
  );
}
