import { AnimatePresence, motion } from "framer-motion";
import { Tv } from "lucide-react";
import { useEffect, useState } from "react";

import { BumperCard } from "./bumper-card";
import { FeaturePanel } from "./feature-panel";
import type { useTvPlayer } from "./use-tv-player";
import type { GuideChannel } from "../../lib/api";

/**
 * Full-screen player CHROME — the 10-foot overlays drawn on top of the persistent
 * <video> when the player is in `full` layout. Playback itself (the effectiveTime
 * state machine + the <video> element) lives in the root PlayerProvider/PlayerHost
 * (`player-context.tsx`) so it survives guide↔watch navigation; this component is pure
 * chrome driven by the hook result passed in. Nothing static on the live video
 * (OLED burn-in): OK slides up the FeaturePanel, Back returns to the guide (mini).
 */

export const ACCENTS = ["#2f9e8f", "#4a9fe0", "#3b82f6", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e", "#7c8aa3"];
export const accentForChannel = (n?: number) => (n == null ? "#3b82f6" : ACCENTS[n % ACCENTS.length]!);

type Player = ReturnType<typeof useTvPlayer>;

export function FullChrome({
  channelId,
  channel,
  player,
  quality,
  audioStreamId,
  subtitleStreamId,
  qualities,
  onSelectQuality,
  onSelectAudio,
  onSelectSub,
  onBack,
}: {
  channelId: string;
  channel?: GuideChannel;
  player: Player;
  quality: string;
  audioStreamId?: string;
  subtitleStreamId?: string;
  qualities: { id: string; label: string }[];
  onSelectQuality: (id: string) => void;
  onSelectAudio: (id?: string) => void;
  onSelectSub: (id?: string) => void;
  onBack: () => void;
}) {
  const { status, controls, tracks } = player;
  const accent = accentForChannel(channel?.number);

  const [panelOpen, setPanelOpen] = useState(false);

  // Remote: panel closed → OK/Up/Down opens it, Back returns to the guide (keeps
  // playing as a mini feed). When the panel is open the FeaturePanel owns the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panelOpen) return;
      const isBack = e.keyCode === 461 || ["Backspace", "GoBack", "BrowserBack", "XF86Back"].includes(e.key);
      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        onBack();
      } else if (e.key === "Enter" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setPanelOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panelOpen, onBack]);

  const isBumper = status.state === "bumper";

  return (
    <>
      {/* Bumper interstitial — status.guide is the upcoming program. */}
      {isBumper && status.guide && (
        <BumperCard channelId={channelId} guide={status.guide} remaining={status.bumperRemaining} accent={accent} />
      )}

      {status.error && !panelOpen && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-lg bg-red-950/90 px-4 py-2 text-red-200">
          {status.error}
        </div>
      )}

      {/* Glass channel chip, top-right — only while the panel is up. */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            key="chip"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: 28,
              right: 40,
              display: "flex",
              alignItems: "center",
              gap: 12,
              height: 56,
              padding: "0 22px 0 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(18,24,38,0.55)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            <span style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `${accent}33`, color: accent }}>
              <Tv size={20} />
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: accent }}>{channel?.number}</span>
            <span style={{ fontSize: 22, fontWeight: 600, color: "#e6eaf1" }}>{channel?.name}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panelOpen && (
          <FeaturePanel
            key="panel"
            guide={status.guide}
            accent={accent}
            scrubber={status.scrubber}
            paused={status.paused}
            canRestart={status.canRestart}
            tracks={tracks}
            qualities={qualities}
            quality={quality}
            audioStreamId={audioStreamId}
            subtitleStreamId={subtitleStreamId}
            onSeekBack={() => controls.seekBy(-10)}
            onSeekForward={() => controls.seekBy(10)}
            onPlayPause={controls.togglePause}
            onLive={controls.jumpToLive}
            onRestart={controls.restart}
            onChannelSurf={onBack}
            onSelectAudio={onSelectAudio}
            onSelectSub={onSelectSub}
            onSelectQuality={onSelectQuality}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
