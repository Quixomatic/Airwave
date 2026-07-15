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
 * OK slides this up (Framer Motion) with the program details, a glass DVR **scrubber**,
 * and the audio / subtitle / quality selectors (base-lyra dropdowns opening upward).
 *
 * Focus model (2 rows): row 0 = the scrubber (◄► seek, OK pause, ▼ to the controls);
 * row 1 = [Restart, Audio, Subtitles, Quality] (◄► move, OK activate, ▲ back to scrubber).
 * Back closes an open menu then the panel. Auto-hides after inactivity.
 */

const HIDE_MS = 8000;
type MenuKey = "audio" | "subs" | "quality" | null;

export type Progress = { position: number; duration: number; liveOffset: number; paused: boolean };

const fmt = (s: number) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

export function FeaturePanel({
  channelName,
  cur,
  media,
  qualities,
  quality,
  audioLang,
  subtitleLang,
  progress,
  onSeekBack,
  onSeekForward,
  onPlayPause,
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
  progress: Progress;
  onSeekBack: () => void;
  onSeekForward: () => void;
  onPlayPause: () => void;
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
  const subHead = isEpisode ? `S${g?.season}, E${g?.episode}${g?.title ? ` · ${g.title}` : ""}` : undefined;

  // focus.row 0 = scrubber; 1 = controls row. focus.col indexes the controls row.
  const [focus, setFocus] = useState<{ row: 0 | 1; col: number }>({ row: 0, col: 0 });
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const scrubberRef = useRef<HTMLButtonElement | null>(null);
  const ctlRefs = useRef<(HTMLElement | null)[]>([]);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const CTL_COUNT = 4; // Restart + 3 dropdowns

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

  useEffect(() => {
    if (focus.row === 0) scrubberRef.current?.focus();
    else ctlRefs.current[focus.col]?.focus();
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
      if (openMenu) return; // base-ui owns keys while a dropdown is open

      if (focus.row === 0) {
        // Scrubber: seek / pause / drop to the controls row.
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onSeekBack();
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onSeekForward();
        } else if (e.key === "Enter") {
          e.preventDefault();
          onPlayPause();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          setFocus({ row: 1, col: 0 });
        }
      } else {
        // Controls row: move / jump up to the scrubber. Enter passes through so the
        // native button activates / the dropdown trigger opens.
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setFocus((f) => ({ row: 1, col: Math.max(0, f.col - 1) }));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setFocus((f) => ({ row: 1, col: Math.min(CTL_COUNT - 1, f.col + 1) }));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setFocus({ row: 0, col: 0 });
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMenu, focus, onClose]);

  const ctl = (i: number): React.CSSProperties => {
    const focused = focus.row === 1 && focus.col === i;
    return {
      display: "flex",
      alignItems: "center",
      gap: 8,
      borderRadius: 10,
      padding: "12px 18px",
      fontSize: 18,
      fontWeight: 600,
      color: "#e6eaf1",
      background: focused ? "rgba(59,130,246,0.15)" : "rgba(148,163,184,0.08)",
      boxShadow: focused ? "inset 0 0 0 2px #3b82f6" : "none",
      border: "none",
      cursor: "pointer",
      whiteSpace: "nowrap",
    };
  };

  const selector = (
    key: Exclude<MenuKey, null>,
    col: number,
    label: string,
    currentValue: string,
    currentLabel: string,
    items: { value: string; label: string }[],
    onValue: (v: string) => void,
  ) => (
    <DropdownMenu open={openMenu === key} onOpenChange={(o) => setOpenMenu(o ? key : null)}>
      <DropdownMenuTrigger
        ref={(el) => {
          ctlRefs.current[col] = el;
        }}
        style={ctl(col)}
      >
        {label}: <span style={{ color: "#94a3b8" }}>{currentLabel}</span> ▾
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" sideOffset={10} align="end" className="min-w-48">
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

  const audioItems = (media?.audioTracks ?? []).map((t) => ({ value: t.lang, label: t.label }));
  const subItems = [
    { value: "off", label: "Off" },
    ...(media?.subtitleTracks ?? []).map((t) => ({ value: t.lang, label: t.label })),
  ];
  const qualityItems = qualities.map((q) => ({ value: q.id, label: q.label }));
  const curAudioVal = audioLang ?? audioItems[0]?.value ?? "";
  const curAudioLabel = media?.audioTracks.find((t) => t.lang === audioLang)?.label ?? "Default";
  const curSubVal = !subtitleLang ? "off" : subtitleLang;
  const curSubLabel = !subtitleLang || subtitleLang === "off" ? "Off" : media?.subtitleTracks.find((t) => t.lang === subtitleLang)?.label ?? subtitleLang;
  const curQualityLabel = qualities.find((q) => q.id === quality)?.label ?? "Original";

  // Scrubber geometry.
  const { position, duration, liveOffset, paused } = progress;
  const pct = duration ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;
  const livePct = duration ? Math.min(100, Math.max(0, (liveOffset / duration) * 100)) : 100;
  const behind = Math.max(0, liveOffset - position);
  const atLive = behind < 5;
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
        padding: "72px 48px 40px",
        background: "linear-gradient(to top, rgba(6,10,20,0.97) 30%, rgba(6,10,20,0.6) 70%, transparent)",
        color: "#f1f5f9",
      }}
    >
      {/* Details */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, color: "#94a3b8" }}>{channelName}</div>
        {heading && (
          <div style={{ fontSize: 34, fontWeight: 700, marginTop: 4 }}>
            {heading}
            {subHead && <span style={{ fontWeight: 400, color: "#c3c9d4" }}> {subHead}</span>}
          </div>
        )}
        {g?.summary && (
          <div style={{ marginTop: 8, fontSize: 18, color: "#c9cfda", maxWidth: 1100, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {g.summary}
          </div>
        )}
      </div>

      {/* Scrubber (glass) */}
      <button
        ref={scrubberRef}
        onClick={onPlayPause}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          border: "none",
          cursor: "pointer",
          borderRadius: 16,
          padding: "18px 22px 14px",
          background: "rgba(15,22,38,0.5)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: scrubFocused ? "inset 0 0 0 2px #3b82f6, 0 8px 30px rgba(0,0,0,0.4)" : "0 8px 30px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 600, color: "#e6eaf1" }}>
            {paused ? "❚❚" : "▶"} {fmt(position)} <span style={{ color: "#64748b" }}>/ {fmt(duration)}</span>
          </span>
        </div>
        {/* Bar */}
        <div style={{ position: "relative", height: 8 }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 999, background: "rgba(148,163,184,0.22)" }} />
          {/* live marker */}
          <div style={{ position: "absolute", top: -3, left: `${livePct}%`, width: 2, height: 14, background: "#ef4444", transform: "translateX(-1px)" }} />
          {/* filled to current position */}
          <div style={{ position: "absolute", top: 0, left: 0, height: 8, width: `${pct}%`, borderRadius: 999, background: "#dfe4ec" }} />
          {/* thumb */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: `${pct}%`,
              width: scrubFocused ? 22 : 16,
              height: scrubFocused ? 22 : 16,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: scrubFocused ? "0 0 0 4px rgba(59,130,246,0.5)" : "0 0 6px rgba(0,0,0,0.5)",
              transform: "translate(-50%, -50%)",
              transition: "width .12s, height .12s",
            }}
          />
        </div>
        {/* Below the bar: live indicator on the far right */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <span
            onClick={(e) => { e.stopPropagation(); onLive(); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700, letterSpacing: 0.5, color: atLive ? "#ef4444" : "#94a3b8" }}
          >
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: atLive ? "#ef4444" : "#64748b" }} />
            {atLive ? "LIVE" : `-${fmt(behind)} · LIVE`}
          </span>
        </div>
      </button>

      {/* Controls row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <button
          ref={(el) => { ctlRefs.current[0] = el; }}
          style={ctl(0)}
          onClick={onRestart}
        >
          ⟲ Restart
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          {selector("audio", 1, "Audio", curAudioVal, curAudioLabel, audioItems.length ? audioItems : [{ value: curAudioVal, label: "Default" }], onSelectAudio)}
          {selector("subs", 2, "Subtitles", curSubVal, curSubLabel, subItems, onSelectSub)}
          {selector("quality", 3, "Quality", quality, curQualityLabel, qualityItems, onSelectQuality)}
        </div>
      </div>
    </motion.div>
  );
}
