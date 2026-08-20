import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Pause, Play, Radio, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { LAYER, useKeyLayer } from "../../lib/input";
import { DEFAULT_ACCENT } from "../../lib/tint";
import { useFullBleed } from "../../lib/full-bleed";
import { useTvPlayer } from "../../features/watch/use-tv-player";

/**
 * /watch/$channelId — the fullscreen channel player. The video is the full-window Rust mpv surface
 * BEHIND the transparent webview; this route paints only the glass chrome over it (the Phase-1
 * compositing model). `useFullBleed` drops the titlebar clearance so the video is edge-to-edge.
 *
 * First working version: play/pause, DVR seek, jump-to-live, restart, a multi-segment scrubber, and a
 * bumper "Up Next" state — driven by `useTvPlayer` (the ported effectiveTime clock). Full FeaturePanel
 * parity (tv-web's info view, ChannelSurf, audio/subtitle menus, bumper art) is a refinement.
 */
export const Route = createFileRoute("/_auth/watch/$channelId")({
  component: WatchRoute,
});

const ACCENT = DEFAULT_ACCENT;
const fmtBehind = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m behind`);

function WatchRoute() {
  const { channelId } = Route.useParams();
  const navigate = useNavigate();
  useFullBleed();

  const { status, controls } = useTvPlayer(channelId);

  // Auto-hide chrome after inactivity; any key/pointer wakes it.
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    setChrome(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 4000);
  }, []);
  useEffect(() => {
    wake();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [wake]);

  const exit = useCallback(() => void navigate({ to: "/" }), [navigate]);

  useKeyLayer({
    id: "watch",
    priority: LAYER.CHROME,
    onKey(e) {
      wake();
      switch (e.key) {
        case "ok":
          controls.togglePause();
          return true;
        case "left":
          controls.seekBy(-10);
          return true;
        case "right":
          controls.seekBy(10);
          return true;
        case "back":
          exit();
          return true;
        default:
          return false;
      }
    },
  });

  const sc = status.scrubber;
  const g = status.guide;
  const isBumper = status.state === "bumper";
  const title = g ? (g.showTitle ? `${g.showTitle} — ${g.title}` : g.title) : "";

  return (
    <div className="absolute inset-0 text-white" onMouseMove={wake} style={{ background: "transparent" }}>
      {/* Loading / buffering veil (video is behind; a light scrim + spinner while it comes up). */}
      {(status.loading || status.buffering) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <Loader2 className="size-10 animate-spin" style={{ color: ACCENT }} />
        </div>
      )}

      {status.error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70 text-center">
          <p className="max-w-lg text-lg text-red-400">{status.error}</p>
          <button onClick={() => controls.togglePause()} className="rounded-lg border border-white/25 px-5 py-2 text-sm">
            Retry
          </button>
        </div>
      )}

      {/* Bumper "Up Next" card. */}
      {isBumper && g && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center">
          <div className="text-sm uppercase tracking-widest text-white/60">Up next</div>
          <div className="text-4xl font-bold">{title}</div>
          {status.bumperRemaining != null && <div className="text-white/50">Starts in {status.bumperRemaining}s</div>}
        </div>
      )}

      <AnimatePresence>
        {chrome && (
          <>
            {/* Top scrim — channel/program title + back. */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute inset-x-0 top-0 flex items-center gap-4 bg-gradient-to-b from-black/70 to-transparent p-6"
            >
              <button onClick={exit} className="rounded-lg border border-white/20 px-3 py-1.5 text-sm hover:bg-white/10">
                ← Guide
              </button>
              <div className="min-w-0">
                <div className="truncate text-xl font-semibold">{title || "…"}</div>
                {g?.summary && <div className="truncate text-sm text-white/60">{g.summary}</div>}
              </div>
            </motion.div>

            {/* Bottom glass control bar. */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-gradient-to-t from-black/80 to-transparent p-6"
            >
              {/* Multi-segment scrubber. */}
              {sc && (
                <div className="relative h-2 w-full">
                  {sc.segments.map((seg, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full overflow-hidden rounded-full"
                      style={{
                        left: `${seg.leftPct}%`,
                        width: `${seg.widthPct}%`,
                        background: seg.kind === "BUMPER" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.22)",
                      }}
                    >
                      {seg.current && <div className="h-full rounded-full" style={{ width: `${seg.fillPct}%`, background: ACCENT }} />}
                    </div>
                  ))}
                  {/* live marker */}
                  {sc.liveVisible && <div className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-red-500" style={{ left: `${sc.livePct}%` }} />}
                  {/* thumb */}
                  <div className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${sc.thumbPct}%` }} />
                </div>
              )}

              <div className="flex items-center gap-3">
                <ControlButton onClick={() => controls.togglePause()} label={status.paused ? "Play" : "Pause"}>
                  {status.paused ? <Play className="size-5" /> : <Pause className="size-5" />}
                </ControlButton>
                <ControlButton onClick={() => controls.restart()} label="Restart">
                  <RotateCcw className="size-5" />
                </ControlButton>
                <ControlButton onClick={() => controls.jumpToLive()} label="Live" active={sc?.atLive}>
                  <Radio className="size-5" />
                </ControlButton>
                <div className="ml-2 text-sm text-white/70">
                  {sc?.atLive ? <span className="font-semibold text-red-400">● LIVE</span> : sc ? fmtBehind(sc.behindS) : null}
                </div>
                {status.delivery && (
                  <div className="ml-auto text-xs uppercase tracking-wide text-white/40">
                    {status.delivery.mode}
                    {status.delivery.connection ? ` · ${status.delivery.connection}` : ""}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ControlButton({ children, onClick, label, active }: { children: React.ReactNode; onClick: () => void; label: string; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/10 transition-colors hover:bg-white/20"
      style={active ? { color: ACCENT, borderColor: ACCENT } : undefined}
    >
      {children}
    </button>
  );
}
