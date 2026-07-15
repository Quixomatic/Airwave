import { motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { accentForChannel, FullChrome } from "./watch";
import { useTvPlayer } from "./use-tv-player";
import { api } from "../../lib/api";
import { useChannels } from "../../hooks/use-channels";

/**
 * The persistent player. Playback (the <video> + the effectiveTime state machine) lives
 * here, at the root, so it SURVIVES guide↔watch navigation — tuning a channel plays it
 * `full`-screen, Back drops it to a `mini` feed docked in the guide's featured panel
 * (still playing), and it only actually stops (session teardown) when you close it. One
 * <video> element, repositioned between full and the featured slot; a channel *change*
 * remounts the host (a clean reload, as the hook is designed), same-channel navigation
 * keeps playing. See [[project-tv-client-api]].
 */

type Layout = "off" | "mini" | "full";

type PlayerCtx = {
  activeChannelId: string | null;
  playingChannelId: string | null;
  layout: Layout;
  miniFocused: boolean;
  miniSel: 0 | 1;
  /** The featured-panel slot the mini feed docks into (guide attaches this ref). */
  miniSlotRef: React.RefObject<HTMLDivElement | null>;
  tune: (channelId: string) => void;
  goFull: () => void;
  goMini: () => void;
  stop: () => void;
  focusMini: () => void;
  blurMini: () => void;
  miniMove: (dir: -1 | 1) => void;
  miniActivate: () => void;
};

const Ctx = createContext<PlayerCtx | null>(null);

export function usePlayer(): PlayerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlayer must be used within PlayerProvider");
  return c;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [activeChannelId, setActive] = useState<string | null>(null);
  const [playingChannelId, setPlaying] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("off");
  const [miniFocused, setMiniFocused] = useState(false);
  const [miniSel, setMiniSel] = useState<0 | 1>(0);
  const miniSlotRef = useRef<HTMLDivElement | null>(null);

  const tune = useCallback((channelId: string) => {
    setActive(channelId);
    setPlaying(channelId);
    setLayout("full");
    setMiniFocused(false);
  }, []);
  const goFull = useCallback(() => {
    setLayout("full");
    setMiniFocused(false);
  }, []);
  const goMini = useCallback(() => {
    setLayout("mini");
    setMiniFocused(false);
  }, []);
  const stop = useCallback(() => {
    setActive(null);
    setPlaying(null);
    setLayout("off");
    setMiniFocused(false);
  }, []);
  const focusMini = useCallback(() => {
    setMiniFocused(true);
    setMiniSel(0);
  }, []);
  const blurMini = useCallback(() => setMiniFocused(false), []);
  const miniMove = useCallback((dir: -1 | 1) => setMiniSel((s) => (s + dir < 0 ? 0 : s + dir > 1 ? 1 : ((s + dir) as 0 | 1))), []);
  const miniActivate = useCallback(() => {
    if (miniSel === 0) goFull();
    else stop();
  }, [miniSel, goFull, stop]);

  const value = useMemo<PlayerCtx>(
    () => ({
      activeChannelId,
      playingChannelId,
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
    }),
    [activeChannelId, playingChannelId, layout, miniFocused, miniSel, tune, goFull, goMini, stop, focusMini, blurMini, miniMove, miniActivate],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {activeChannelId && (
        <PlayerHost
          key={activeChannelId}
          channelId={activeChannelId}
          layout={layout}
          miniFocused={miniFocused}
          miniSel={miniSel}
          slotRef={miniSlotRef}
          onBack={goMini}
          onGoFull={goFull}
          onClose={stop}
        />
      )}
    </Ctx.Provider>
  );
}

/** Track a fixed viewport size for the full-screen rect. */
function useViewport() {
  const [size, setSize] = useState(() => ({
    w: typeof window !== "undefined" ? window.innerWidth : 1920,
    h: typeof window !== "undefined" ? window.innerHeight : 1080,
  }));
  useEffect(() => {
    const f = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return size;
}

/** Measure a ref's viewport rect while `active`, keeping it fresh on layout/resize. */
function useSlotRect(ref: React.RefObject<HTMLDivElement | null>, active: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!active) return;
    const measure = () => ref.current && setRect(ref.current.getBoundingClientRect());
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, active]);
  return rect;
}

function PlayerHost({
  channelId,
  layout,
  miniFocused,
  miniSel,
  slotRef,
  onBack,
  onGoFull,
  onClose,
}: {
  channelId: string;
  layout: Layout;
  miniFocused: boolean;
  miniSel: 0 | 1;
  slotRef: React.RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onGoFull: () => void;
  onClose: () => void;
}) {
  const { data: channels } = useChannels();
  const channel = channels?.find((c) => c.id === channelId);
  const accent = accentForChannel(channel?.number);

  const [quality, setQuality] = useState("original");
  const [audioLang, setAudioLang] = useState<string | undefined>(undefined);
  const [subtitleLang, setSubtitleLang] = useState<string | undefined>(undefined);
  const [qualities, setQualities] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    api.qualities().then((r) => setQualities(r.qualities)).catch(() => {});
  }, []);

  const player = useTvPlayer(channelId, { quality, audioLang, subtitleLang });

  const vp = useViewport();
  const slot = useSlotRect(slotRef, layout === "mini");

  const full = layout === "full";
  // full → fill the screen. mini + docked → the featured slot. mini with no slot (e.g. we
  // navigated to Settings, where the guide's dock is unmounted) → hide, so it doesn't cover
  // the screen (audio keeps playing).
  const target = full
    ? { top: 0, left: 0, width: vp.w, height: vp.h, borderRadius: 0, opacity: 1 }
    : slot
      ? { top: slot.top, left: slot.left, width: slot.width, height: slot.height, borderRadius: 14, opacity: 1 }
      : { top: 0, left: 0, width: vp.w, height: vp.h, borderRadius: 0, opacity: 0 };

  return (
    <motion.div
      initial={false}
      animate={target}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      style={{
        position: "fixed",
        overflow: "hidden",
        background: "#000",
        zIndex: full ? 50 : 15,
        pointerEvents: full ? "auto" : "none",
        boxShadow: full ? "none" : "0 12px 40px rgba(0,0,0,0.6)",
      }}
    >
      {/* One <video> for both layouts (never remounted across full↔mini, so the stream
          doesn't reload). Audio keeps playing in mini — TODO: make that a user setting. */}
      <video
        ref={player.videoRef}
        playsInline
        style={{ width: "100%", height: "100%", objectFit: full ? "contain" : "cover" }}
      />

      {full && (
        <FullChrome
          channelId={channelId}
          channel={channel}
          player={player}
          quality={quality}
          audioLang={audioLang}
          subtitleLang={subtitleLang}
          qualities={qualities}
          onSelectQuality={setQuality}
          onSelectAudio={setAudioLang}
          onSelectSub={setSubtitleLang}
          onBack={onBack}
        />
      )}

      {/* Mini feed focus overlay — two buttons: go full, or close the feed. */}
      {layout === "mini" && miniFocused && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            background: "rgba(6,10,20,0.55)",
            backdropFilter: "blur(2px)",
            pointerEvents: "auto",
          }}
        >
          <MiniButton label="Full screen" icon={<Maximize2 size={26} />} selected={miniSel === 0} accent={accent} onClick={onGoFull} />
          <MiniButton label="Close" icon={<X size={26} />} selected={miniSel === 1} accent={accent} onClick={onClose} />
        </div>
      )}
    </motion.div>
  );
}

function MiniButton({
  label,
  icon,
  selected,
  accent,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: selected ? "#f1f5f9" : "#94a3b8",
      }}
    >
      <span
        style={{
          width: 60,
          height: 60,
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
      <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
    </button>
  );
}
