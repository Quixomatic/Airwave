import { AnimatePresence, motion } from "framer-motion";
import { Tv } from "lucide-react";
import { useEffect, useState } from "react";

import { FeaturePanel } from "./feature-panel";
import { useTvPlayer } from "./use-tv-player";
import { api, type GuideChannel } from "../../lib/api";

/**
 * The channel player. Playback (the effectiveTime state machine: timeline-driven
 * rollover, cross-program rewind, native-first delivery, sessions) lives in
 * `use-tv-player.ts`. This component owns the 10-foot chrome: nothing on the live
 * video (OLED burn-in), OK slides up the FeaturePanel, Back exits.
 */

const ACCENTS = ["#2f9e8f", "#4a9fe0", "#3b82f6", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e", "#7c8aa3"];

export function Watch({
  channelId,
  channel,
  onExit,
}: {
  channelId: string;
  channel?: GuideChannel;
  onExit: () => void;
}) {
  const accent = channel ? ACCENTS[channel.number % ACCENTS.length]! : "#3b82f6";

  const [quality, setQuality] = useState("original");
  const [audioLang, setAudioLang] = useState<string | undefined>(undefined);
  const [subtitleLang, setSubtitleLang] = useState<string | undefined>(undefined);
  const [qualities, setQualities] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    api.qualities().then((r) => setQualities(r.qualities)).catch(() => {});
  }, []);

  const { videoRef, status, controls, tracks } = useTvPlayer(channelId, { quality, audioLang, subtitleLang });

  const [panelOpen, setPanelOpen] = useState(false);

  // Remote: panel closed → OK/Up/Down opens it, Back exits (the hook tears down on
  // unmount). When the panel is open the FeaturePanel owns the keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panelOpen) return;
      const isBack = e.keyCode === 461 || ["Backspace", "GoBack", "BrowserBack", "XF86Back"].includes(e.key);
      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        onExit();
      } else if (e.key === "Enter" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setPanelOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panelOpen, onExit]);

  const isBumper = status.state === "bumper";

  return (
    <div className="relative h-full w-full bg-black">
      <video ref={videoRef} className="h-full w-full" playsInline />

      {/* Bumper interstitial — transient, designed card. status.guide is the upcoming program. */}
      {isBumper && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
          <p className="text-2xl text-zinc-400">We'll be right back…</p>
          {status.guide?.title && <p className="text-4xl font-semibold">Up next: {status.guide.title}</p>}
        </div>
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
            audioLang={audioLang}
            subtitleLang={subtitleLang}
            onSeekBack={() => controls.seekBy(-10)}
            onSeekForward={() => controls.seekBy(10)}
            onPlayPause={controls.togglePause}
            onLive={controls.jumpToLive}
            onRestart={controls.restart}
            onChannelSurf={onExit}
            onSelectAudio={(lang) => setAudioLang(lang)}
            onSelectSub={(lang) => setSubtitleLang(lang)}
            onSelectQuality={(id) => setQuality(id)}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
