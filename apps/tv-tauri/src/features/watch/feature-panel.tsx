import { Button } from "@airwave/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@airwave/ui/components/dropdown-menu";
import { motion } from "framer-motion";
import {
  AudioLines,
  Captions,
  Clapperboard,
  Info,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  Star,
  Tv,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { GuideMeta } from "../../lib/api";
import { LAYER, useKeyLayer } from "../../lib/input";
import type { Delivery, ScrubberView } from "./use-tv-player";

/**
 * The watch-screen feature panel — nothing is drawn on the live video (OLED burn-in).
 * OK slides this up (Framer Motion): the program title, a minimal borderless DVR
 * scrubber (accent fill, thumb, time under the thumb, LIVE on the far right), a row of
 * glassmorphism control pills, and circular glass icon buttons for audio / subtitles /
 * quality (base-lyra dropdowns opening upward). ALL icons are lucide — the C2's system
 * font has no glyphs for unicode symbols (they render as tofu boxes).
 *
 * Focus: row 0 = scrubber (◄► seek, OK pause, ▼ to controls); row 1 = the buttons
 * (◄► move, OK activate, ▲ to scrubber). Back closes an open menu then the panel.
 */

const HIDE_MS = 3500; // desktop: shorter than tv-web's 8s — a mouse reveals the chrome instantly
type MenuKey = "audio" | "subs" | "quality" | null;
type Track = { id: string; lang: string; label: string };


const fmt = (s: number) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

const ICON = 18;

export function FeaturePanel({
  guide,
  accent,
  scrubber,
  delivery,
  paused,
  canRestart,
  tracks,
  qualities,
  quality,
  audioStreamId,
  subtitleStreamId,
  onSeekBack,
  onSeekForward,
  onPlayPause,
  onLive,
  onRestart,
  onChannelSurf,
  onSelectAudio,
  onSelectSub,
  onSelectQuality,
  onClose,
}: {
  guide: GuideMeta | null;
  accent: string;
  scrubber: ScrubberView | null;
  delivery: Delivery | null;
  paused: boolean;
  canRestart: boolean;
  tracks: { audio: Track[]; subtitle: Track[] };
  qualities: { id: string; label: string }[];
  quality: string;
  audioStreamId?: string;
  subtitleStreamId?: string;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onPlayPause: () => void;
  onLive: () => void;
  onRestart: () => void;
  onChannelSurf: () => void;
  onSelectAudio: (id: string) => void;
  onSelectSub: (id: string) => void;
  onSelectQuality: (id: string) => void;
  onClose: () => void;
}) {
  const g = guide;
  const isEpisode = !!g?.showTitle && g?.season != null && g?.episode != null;
  const title = isEpisode ? g?.showTitle : g?.title;
  const subTitle = isEpisode ? `S${g?.season}, E${g?.episode}${g?.title ? ` · ${g.title}` : ""}` : undefined;

  const [focus, setFocus] = useState<{ row: 0 | 1; col: number }>({ row: 0, col: 0 });
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const [infoMode, setInfoMode] = useState(false);
  const scrubberRef = useRef<HTMLButtonElement | null>(null);
  const ctlRefs = useRef<(HTMLElement | null)[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CTL_COUNT = 8; // Pause · Restart · ChannelSurf · Info · Live · Audio · Subs · Quality

  const armHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (openMenu) return;
    hideTimer.current = setTimeout(onClose, HIDE_MS);
  };
  useEffect(() => {
    armHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMenu]);

  // Desktop: moving the mouse keeps the panel up (resets the auto-hide), like any video player.
  useEffect(() => {
    const onMove = () => armHide();
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMenu]);

  useEffect(() => {
    if (focus.row === 0) scrubberRef.current?.focus();
    else ctlRefs.current[focus.col]?.focus();
  }, [focus]);

  // Owns the keys while the panel is open. Number entry (OVERLAY) and channel surf (MODAL) sit
  // above, so their old hand-checked guards are gone.
  //
  // NOTE: this is the one place in the app that drives REAL DOM focus (the scrubber + control
  // buttons above), so OK is deliberately NOT claimed on the control row — leaving it unconsumed
  // lets the natively-focused button/dropdown-trigger fire its own click. Same reason the
  // `openMenu` branch returns false: base-ui owns the keys while a dropdown is open.
  useKeyLayer({
    id: "feature-panel",
    priority: LAYER.CHROME,
    onKey(e) {
      if (e.key === "back") {
        if (infoMode) setInfoMode(false);
        else if (openMenu) setOpenMenu(null);
        else onClose();
        return true;
      }
      armHide();
      if (infoMode) return false; // details view — Back exits it; no nav
      if (openMenu) return false; // base-ui owns keys while a dropdown is open
      // Spacebar = play/pause from anywhere in the open chrome (either focus row).
      if (e.key === "playpause") {
        onPlayPause();
        return true;
      }
      if (focus.row === 0) {
        switch (e.key) {
          case "left":
            onSeekBack();
            return true;
          case "right":
            onSeekForward();
            return true;
          case "ok":
            onPlayPause();
            return true;
          case "down":
            setFocus({ row: 1, col: 0 });
            return true;
        }
        return false;
      }
      switch (e.key) {
        case "left":
          setFocus((f) => ({ row: 1, col: Math.max(0, f.col - 1) }));
          return true;
        case "right":
          setFocus((f) => ({ row: 1, col: Math.min(CTL_COUNT - 1, f.col + 1) }));
          return true;
        case "up":
          setFocus({ row: 0, col: 0 });
          return true;
      }
      // OK passes through → native button / dropdown-trigger handles it.
      return false;
    },
  });

  const focused = (i: number) => focus.row === 1 && focus.col === i;
  const glass = (i: number, circle = false): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: circle ? 0 : 8,
    height: 40,
    width: circle ? 40 : undefined,
    padding: circle ? 0 : "0 15px",
    borderRadius: circle ? "50%" : 999,
    outline: "none",
    border: `1px solid rgba(255,255,255,${focused(i) ? 0.4 : 0.12})`,
    background: focused(i) ? "rgba(59,130,246,0.28)" : "rgba(18,24,38,0.55)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: focused(i) ? "0 0 0 2px rgba(59,130,246,0.7)" : "none",
    transition: "background .12s, border-color .12s",
  });

  const circleSelector = (
    key: Exclude<MenuKey, null>,
    col: number,
    Icon: typeof AudioLines,
    currentValue: string,
    items: { value: string; label: string }[],
    onValue: (v: string) => void,
  ) => (
    <DropdownMenu open={openMenu === key} onOpenChange={(o) => setOpenMenu(o ? key : null)}>
      <DropdownMenuTrigger
        ref={(el) => {
          ctlRefs.current[col] = el;
        }}
        style={glass(col, true)}
        aria-label={key}
      >
        <Icon size={ICON} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" sideOffset={12} align="end" className="min-w-48">
        <DropdownMenuRadioGroup value={currentValue} onValueChange={onValue}>
          {items.map((it) => (
            <DropdownMenuRadioItem key={it.value} value={it.value} className="text-base">
              {it.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const audioItems = [
    { value: "", label: "Default" },
    ...tracks.audio.map((t) => ({ value: t.id, label: t.label })),
  ];
  const subItems = [
    { value: "off", label: "Off" },
    ...tracks.subtitle.map((t) => ({ value: t.id, label: t.label })),
  ];
  const qualityItems = qualities.map((q) => ({ value: q.id, label: q.label }));

  // Scrubber geometry — percentages are pre-computed by the hook (expanded focus program
  // + fixed left/right peeks). See use-tv-player buildScrubber.
  const sc = scrubber;
  const posPct = sc?.thumbPct ?? 0;
  const livePct = sc?.livePct ?? 100;
  const liveInWindow = sc?.liveVisible ?? true;
  const atLive = sc?.atLive ?? true;
  const behind = sc?.behindS ?? 0;
  const scrubFocused = focus.row === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 48 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 48 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        padding: "96px 56px 40px",
        background: "linear-gradient(to top, rgba(6,10,20,0.92) 25%, rgba(6,10,20,0.4) 65%, transparent)",
        color: "#f1f5f9",
      }}
    >
      {/* Info view: a Back button above the title (exits the details). */}
      {infoMode && (
        <div style={{ marginBottom: 12 }}>
          <Button variant="ghost" onClick={() => setInfoMode(false)}>
            ← Back
          </Button>
        </div>
      )}

      {/* Program title */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.5px" }}>{title}</div>
        {subTitle && <div style={{ marginTop: 2, fontSize: 20, color: "#c3c9d4" }}>{subTitle}</div>}
      </div>

      {infoMode ? (
        /* Info mode — the details fill the space (no scrubber / controls). Back exits. */
        <div style={{ maxWidth: 1300 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 20, color: "#c3c9d4", marginBottom: 16 }}>
            {g?.year && <span>{g.year}</span>}
            {g?.contentRating && <span style={{ padding: "2px 10px", borderRadius: 6, background: "rgba(148,163,184,0.18)" }}>{g.contentRating}</span>}
            {g?.criticRating != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Star size={18} fill="#f0a92a" color="#f0a92a" /> {g.criticRating.toFixed(1)}
              </span>
            )}
            {g?.durationMs ? <span>{Math.round(g.durationMs / 60000)} min</span> : null}
          </div>
          {g?.summary && <div style={{ fontSize: 22, lineHeight: 1.5, color: "#dfe4ec", maxWidth: 1100 }}>{g.summary}</div>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 40, marginTop: 24 }}>
            {g?.genres?.length ? <DetailCol label="Genres" value={g.genres.join(", ")} /> : null}
            {g?.cast?.length ? <DetailCol label="Cast" value={g.cast.join(", ")} /> : null}
            {g?.directors?.length ? <DetailCol label="Director" value={g.directors.join(", ")} /> : null}
            {g?.studio ? <DetailCol label="Studio" value={g.studio} /> : null}
          </div>
          {delivery && <DeliveryReadout delivery={delivery} accent={accent} />}
        </div>
      ) : (
        <>
          {/* Scrubber — borderless */}
          <button
            ref={scrubberRef}
            onClick={onPlayPause}
            style={{ display: "block", width: "100%", textAlign: "left", border: "none", outline: "none", background: "transparent", cursor: "pointer", padding: "6px 0 4px" }}
          >
            <div style={{ position: "relative", height: 8 }}>
              {/* one rounded segment per slot (tiny gaps); the current slot fills to the thumb in the accent */}
              {sc?.segments.map((seg, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: 0,
                    height: 8,
                    left: `calc(${seg.leftPct}% + 2px)`,
                    width: `calc(${seg.widthPct}% - 4px)`,
                    borderRadius: 999,
                    overflow: "hidden",
                    background: seg.kind === "BUMPER" ? "rgba(148,163,184,0.30)" : "rgba(255,255,255,0.18)",
                    transition: "left 0.35s ease, width 0.35s ease",
                  }}
                >
                  {seg.fillPct > 0 && (
                    <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${seg.fillPct}%`, background: accent, transition: "width 0.35s ease" }} />
                  )}
                </div>
              ))}
              {liveInWindow && (
                <div style={{ position: "absolute", top: -4, left: `${livePct}%`, width: 2, height: 16, background: "#ef4444", transform: "translateX(-1px)", transition: "left 0.35s ease" }} />
              )}
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `${posPct}%`,
                  width: scrubFocused ? 24 : 16,
                  height: scrubFocused ? 24 : 16,
                  borderRadius: "50%",
                  background: "#fff",
                  boxShadow: scrubFocused ? `0 0 0 5px ${accent}66` : "0 0 6px rgba(0,0,0,0.5)",
                  transform: "translate(-50%, -50%)",
                  transition: "width .12s, height .12s, left 0.35s ease",
                }}
              />
            </div>
            <div style={{ position: "relative", height: 26, marginTop: 10 }}>
              <span style={{ position: "absolute", left: `${posPct}%`, transform: "translateX(-50%)", fontSize: 17, fontWeight: 600, color: scrubFocused ? "#f1f5f9" : "#c3c9d4", transition: "left 0.35s ease" }}>
                {fmt(sc?.slotPositionS ?? 0)}
              </span>
              <span
                onClick={(e) => { e.stopPropagation(); onLive(); }}
                style={{ position: "absolute", right: 0, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, letterSpacing: 0.5, color: atLive ? "#ef4444" : "#94a3b8" }}
              >
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: atLive ? "#ef4444" : "#64748b" }} />
                {atLive ? "LIVE" : `-${fmt(behind)}`}
              </span>
            </div>
          </button>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
            <button ref={(el) => { ctlRefs.current[0] = el; }} style={glass(0)} onClick={onPlayPause}>
              {paused ? <Play size={ICON} /> : <Pause size={ICON} />} {paused ? "Play" : "Pause"}
            </button>
            <button
              ref={(el) => { ctlRefs.current[1] = el; }}
              style={{ ...glass(1), opacity: canRestart ? 1 : 0.4 }}
              onClick={onRestart}
            >
              <RotateCcw size={ICON} /> Restart
            </button>
            <button ref={(el) => { ctlRefs.current[2] = el; }} style={glass(2)} onClick={onChannelSurf}>
              <Tv size={ICON} /> Channel Surf
            </button>
            <button ref={(el) => { ctlRefs.current[3] = el; }} style={glass(3)} onClick={() => setInfoMode(true)}>
              <Info size={ICON} /> Info
            </button>
            <button ref={(el) => { ctlRefs.current[4] = el; }} style={glass(4)} onClick={onLive}>
              {atLive ? <Clapperboard size={ICON} /> : <Radio size={ICON} />} {atLive ? "Continue Watching" : "Jump to Live"}
            </button>

            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
              {circleSelector("audio", 5, AudioLines, audioStreamId ?? "", audioItems, onSelectAudio)}
              {circleSelector("subs", 6, Captions, subtitleStreamId && subtitleStreamId !== "off" ? subtitleStreamId : "off", subItems, onSelectSub)}
              {circleSelector("quality", 7, SlidersHorizontal, quality, qualityItems, onSelectQuality)}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}

function DetailCol({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ maxWidth: 360 }}>
      <div style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, color: "#dfe4ec" }}>{value}</div>
    </div>
  );
}

const MODE_LABEL: Record<Delivery["mode"], string> = {
  direct: "Direct Play",
  http: "Progressive Transcode",
  hls: "HLS Transcode",
};

const CONN_LABEL: Record<NonNullable<Delivery["connection"]>, string> = {
  local: "Local",
  remote: "Remote",
  relay: "Relay",
};

// Small tucked-away readout of HOW the current program is being delivered (mode / container /
// video+audio codec, each with Plex's copy-vs-transcode call) — for diagnosing a bad channel
// without leaving the couch. Shown at the bottom of the Info view.
function DeliveryReadout({ delivery, accent }: { delivery: Delivery; accent: string }) {
  const chip = (main: string, sub?: string | null) => (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, fontSize: 15, padding: "5px 12px", borderRadius: 6, background: "rgba(148,163,184,0.14)", color: "#dfe4ec" }}>
      {main.toUpperCase()}
      {sub && <span style={{ fontSize: 12, color: sub === "transcode" ? "#f0a92a" : "#64748b" }}>{sub}</span>}
    </span>
  );
  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 1, color: "#64748b", marginBottom: 8 }}>Playback</div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, padding: "5px 12px", borderRadius: 6, background: `${accent}22`, color: accent }}>
          {MODE_LABEL[delivery.mode]}
        </span>
        {delivery.container && chip(delivery.container)}
        {delivery.videoCodec && chip(delivery.videoCodec, delivery.videoDecision)}
        {delivery.audioCodec && chip(delivery.audioCodec, delivery.directAudioLabel ?? delivery.audioDecision)}
        {delivery.connection && (
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              padding: "5px 12px",
              borderRadius: 6,
              background: delivery.connection === "local" ? "rgba(148,163,184,0.14)" : `${accent}22`,
              color: delivery.connection === "local" ? "#dfe4ec" : accent,
            }}
          >
            {CONN_LABEL[delivery.connection].toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}
