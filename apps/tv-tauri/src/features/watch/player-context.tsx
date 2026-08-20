import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api } from "../../lib/api";
import { useGuide } from "../../hooks/use-guide";
import { useFullBleed } from "../../lib/full-bleed";
import { FullChrome } from "./full-chrome";
import { mpv } from "./mpv";
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
  const channelStep = useCallback(() => {}, []); // CH▲/▼ — a later refinement

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
    } else if (layout === "mini") {
      syncMini();
    } else {
      setMiniRect(null);
      void mpv.fillWindow(); // reset margins (mpv is stopped in `off`)
    }
  }, [layout, syncMini]);

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
  const { data: qData } = useQuery({ queryKey: ["qualities"], queryFn: () => api.qualities() });

  const hidden = layout === "full";

  return (
    <Ctx.Provider value={value}>
      {/* Backdrop behind the guide: full navy (off), a rounded HOLE at the slot (mini), nothing (full). */}
      {layout !== "full" &&
        (layout === "mini" && miniRect ? (
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
