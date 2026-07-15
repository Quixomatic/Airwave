import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@ChannelGuide/ui/components/dropdown-menu";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

import type { MediaInfo, NowNext } from "../../lib/api";

/**
 * The watch-screen feature panel — nothing is drawn on the live video (OLED burn-in);
 * pressing OK slides this up from the bottom (Framer Motion) with the program details,
 * DVR controls, and the audio / subtitle / quality selectors (base-lyra dropdowns that
 * open upward). D-pad ◄► moves across the controls, OK activates, Back closes the open
 * menu then the panel. Auto-hides after inactivity so it never sits burned on screen.
 */

const HIDE_MS = 8000;

type MenuKey = "audio" | "subs" | "quality" | null;

export function FeaturePanel({
  channelName,
  cur,
  media,
  qualities,
  quality,
  audioLang,
  subtitleLang,
  paused,
  onPlayPause,
  onRewind,
  onForward,
  onLive,
  onRestart,
  onSelectAudio,
  onSelectSub,
  onSelectQuality,
  onClose,
}: {
  channelName: string;
  cur: NowNext["current"];
  media: MediaInfo | null;
  qualities: { id: string; label: string }[];
  quality: string;
  audioLang?: string;
  subtitleLang?: string;
  paused: boolean;
  onPlayPause: () => void;
  onRewind: () => void;
  onForward: () => void;
  onLive: () => void;
  onRestart: () => void;
  onSelectAudio: (lang: string) => void;
  onSelectSub: (lang: string) => void;
  onSelectQuality: (id: string) => void;
  onClose: () => void;
}) {
  const g = cur?.guide;
  const isEpisode = !!g?.showTitle && g?.season != null && g?.episode != null;
  const heading = isEpisode ? g?.showTitle : g?.title;
  const sub = isEpisode ? `S${g?.season}, E${g?.episode}${g?.title ? ` · ${g.title}` : ""}` : undefined;

  const [focus, setFocus] = useState(2); // default to Play/Pause
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Controls in focus order: 0 Restart · 1 −15 · 2 Play/Pause · 3 +15 · 4 Live ·
  // 5 Audio · 6 Subtitles · 7 Quality. Dropdown triggers occupy 5/6/7.
  const COUNT = 8;

  const armHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    // Don't auto-hide while a menu is open (the user is browsing tracks).
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

  useEffect(() => {
    refs.current[focus]?.focus();
  }, [focus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isBack =
        e.keyCode === 461 || ["Backspace", "GoBack", "BrowserBack", "XF86Back"].includes(e.key);
      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        if (openMenu) setOpenMenu(null);
        else onClose();
        return;
      }
      armHide();
      // While a dropdown is open, base-ui owns the arrow/enter keys — don't interfere.
      if (openMenu) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocus((f) => Math.max(0, f - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocus((f) => Math.min(COUNT - 1, f + 1));
      }
      // Enter is NOT intercepted: native buttons activate, dropdown triggers open.
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMenu, onClose]);

  const ctl = (i: number): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    padding: "12px 18px",
    fontSize: 18,
    fontWeight: 600,
    color: "#e6eaf1",
    background: focus === i ? "rgba(59,130,246,0.15)" : "rgba(148,163,184,0.08)",
    boxShadow: focus === i ? "inset 0 0 0 2px #3b82f6" : "none",
    border: "none",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  const selector = (
    key: Exclude<MenuKey, null>,
    idx: number,
    label: string,
    current: string,
    items: { value: string; label: string }[],
    onValue: (v: string) => void,
  ) => (
    <DropdownMenu open={openMenu === key} onOpenChange={(o) => setOpenMenu(o ? key : null)}>
      <DropdownMenuTrigger
        ref={(el) => {
          refs.current[idx] = el;
        }}
        style={ctl(idx)}
      >
        {label}: <span style={{ color: "#94a3b8" }}>{current}</span> ▾
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" sideOffset={10} align="end" className="min-w-48">
        <DropdownMenuRadioGroup value={current} onValueChange={onValue}>
          {items.map((it) => (
            <DropdownMenuRadioItem key={it.value} value={it.value} className="text-base">
              {it.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const audioItems = (media?.audioTracks ?? []).map((t) => ({ value: t.lang, label: t.label }));
  const subItems = [
    { value: "off", label: "Off" },
    ...(media?.subtitleTracks ?? []).map((t) => ({ value: t.lang, label: t.label })),
  ];
  const qualityItems = qualities.map((q) => ({ value: q.id, label: q.label }));
  const curAudio = media?.audioTracks.find((t) => t.lang === audioLang)?.label ?? "Default";
  const curSub = !subtitleLang || subtitleLang === "off" ? "Off" : media?.subtitleTracks.find((t) => t.lang === subtitleLang)?.label ?? subtitleLang;
  const curQuality = qualities.find((q) => q.id === quality)?.label ?? "Original";

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
        padding: "72px 48px 40px",
        background: "linear-gradient(to top, rgba(6,10,20,0.97) 30%, rgba(6,10,20,0.6) 70%, transparent)",
        color: "#f1f5f9",
      }}
    >
        {/* Details */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 16, color: "#94a3b8" }}>{channelName}</div>
          {heading && (
            <div style={{ fontSize: 34, fontWeight: 700, marginTop: 4 }}>
              {heading}
              {sub && <span style={{ fontWeight: 400, color: "#c3c9d4" }}> {sub}</span>}
            </div>
          )}
          {g?.summary && (
            <div style={{ marginTop: 8, fontSize: 18, color: "#c9cfda", maxWidth: 1100, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {g.summary}
            </div>
          )}
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button ref={(el) => { refs.current[0] = el; }} style={ctl(0)} onClick={onRestart}>⟲ Restart</button>
          <button ref={(el) => { refs.current[1] = el; }} style={ctl(1)} onClick={onRewind}>⏪ 15s</button>
          <button ref={(el) => { refs.current[2] = el; }} style={ctl(2)} onClick={onPlayPause}>
            {paused ? "▶ Play" : "❚❚ Pause"}
          </button>
          <button ref={(el) => { refs.current[3] = el; }} style={ctl(3)} onClick={onForward}>15s ⏩</button>
          <button ref={(el) => { refs.current[4] = el; }} style={ctl(4)} onClick={onLive}>⏭ Live</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
            {selector("audio", 5, "Audio", curAudio, audioItems, onSelectAudio)}
            {selector("subs", 6, "Subtitles", curSub ?? "Off", subItems, onSelectSub)}
            {selector("quality", 7, "Quality", curQuality, qualityItems, onSelectQuality)}
          </div>
        </div>
      </motion.div>
  );
}
