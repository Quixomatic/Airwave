import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import * as LucideIcons from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { imageUrl, type GuideGridProgram } from "../../lib/api";
import { LAYER, useKeyLayer } from "../../lib/input";
import { channelVivid } from "../../lib/tint";
import { useGuide } from "../../hooks/use-guide";
import { usePlayer } from "./player-ctx";

/**
 * Channel surf (§7.2, Arc 3). With the full-screen chrome closed, ◄/► slide up a horizontal
 * carousel of channel tiles — each with cover art, a progress bar, and what's on now — opening
 * centered on the channel you're already watching (marked with a subtle "Watching" flag). ◄/► move
 * (WRAPPING, so channel 1 → last is one press), **OK tunes** the highlighted channel, **Back closes**
 * without changing, and ~12s of no input auto-hides it.
 *
 * Virtualized horizontally (@tanstack/react-virtual) like the guide grid, so 100+ tiles — and their
 * cover-art images — stay cheap: only the visible window loads. It registers as the app's top
 * (MODAL, exclusive) input layer while up, so number entry / CH▲/▼ / the player chrome all defer.
 */

const TILE_W = 300;
const GAP = 22;
const ART_H = Math.round((TILE_W * 9) / 16); // 16:9
const AUTO_HIDE_MS = 12_000;

const LUCIDE = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number | string }>>;
const channelIcon = (id?: string | null) =>
  id && id.startsWith("lucide:") ? LUCIDE[id.slice(7)] ?? LucideIcons.Radio : LucideIcons.Radio;

/** Index of the program airing at `nowMs` (else 0) — the "on now" slot (same rule as the guide). */
function liveProgramIndex(programs: GuideGridProgram[], nowMs: number): number {
  const i = programs.findIndex((p) => {
    const s = new Date(p.startsAt).getTime();
    return nowMs >= s && nowMs < s + p.durationSeconds * 1000;
  });
  return i >= 0 ? i : 0;
}

export function ChannelSurf({
  currentChannelId,
  onClose,
}: {
  currentChannelId: string;
  onClose: () => void;
}) {
  const { data: guide } = useGuide();
  const { tune } = usePlayer();

  const channels = useMemo(
    () => [...(guide?.channels ?? [])].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    [guide],
  );
  const len = channels.length;
  const clockOffset = useMemo(
    () => (guide ? new Date(guide.serverTime).getTime() - Date.now() : 0),
    [guide],
  );
  const nowMs = () => Date.now() + clockOffset;

  // Open centered on the channel you're already watching.
  const startIdx = useMemo(() => {
    const cur = channels.findIndex((c) => c.id === currentChannelId);
    return cur < 0 ? 0 : cur;
  }, [channels, currentChannelId]);

  const [focused, setFocused] = useState(startIdx);
  const focusedRef = useRef(startIdx);

  const parentRef = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1920));
  useEffect(() => {
    const f = () => setVw(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  const pad = Math.max(0, (vw - TILE_W) / 2); // so any tile — including the ends — can sit centered

  const virtualizer = useVirtualizer({
    count: len,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TILE_W + GAP,
    horizontal: true,
    overscan: 4,
    paddingStart: pad,
    paddingEnd: pad,
  });

  // Auto-hide, in its OWN effect so it isn't reset by unrelated re-renders (the player status ticks
  // ~2×/s and would otherwise keep restarting the countdown). `onClose` is read through a ref so this
  // effect stays mount-only and the timer actually reaches 12s.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const hideTimerRef = useRef(0);
  const resetHide = useCallback(() => {
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => onCloseRef.current(), AUTO_HIDE_MS);
  }, []);
  useEffect(() => {
    resetHide();
    return () => window.clearTimeout(hideTimerRef.current);
  }, [resetHide]);

  // Center the opening tile instantly (no long slide on open).
  useEffect(() => {
    const raf = requestAnimationFrame(() => virtualizer.scrollToIndex(startIdx, { align: "center" }));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = useCallback(
    (dir: 1 | -1) => {
      if (len === 0) return;
      const nf = (focusedRef.current + dir + len) % len;
      const wrapped = Math.abs(nf - focusedRef.current) > 1; // last↔first jump → don't slide across all
      focusedRef.current = nf;
      setFocused(nf);
      virtualizer.scrollToIndex(nf, { align: "center", behavior: wrapped ? undefined : "smooth" });
    },
    [len, virtualizer],
  );

  // MODAL + exclusive: while surf is up it owns every key — nothing leaks to the chrome, the guide,
  // or channel-number entry. (That last one used to be enforced by number entry checking
  // `surfActiveRef`; being the top layer does it now.) ▲/▼ are claimed explicitly so they keep the
  // carousel alive rather than doing nothing.
  useKeyLayer({
    id: "channel-surf",
    priority: LAYER.MODAL,
    mode: "exclusive",
    onKey(e) {
      switch (e.key) {
        case "left":
          resetHide();
          move(-1);
          return true;
        case "right":
          resetHide();
          move(1);
          return true;
        case "ok": {
          const ch = channels[focusedRef.current];
          if (ch && ch.id !== currentChannelId) tune(ch.id);
          onCloseRef.current();
          return true;
        }
        case "back":
          onCloseRef.current();
          return true;
        case "up":
        case "down":
          resetHide();
          return true;
      }
      return false;
    },
  });

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 56,
        height: 440,
        paddingTop: 22,
        background: "linear-gradient(to top, rgba(4,6,12,0.96) 40%, rgba(4,6,12,0))",
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 14 }}>
        Channel Surf
      </div>
      <div ref={parentRef} style={{ width: "100%", overflowX: "hidden", overflowY: "hidden" }}>
        <div style={{ position: "relative", width: virtualizer.getTotalSize(), height: ART_H + 150 }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const ch = channels[vi.index];
            if (!ch) return null;
            const isFocused = vi.index === focused;
            const isCurrent = ch.id === currentChannelId;
            const accent = channelVivid(ch) ?? "#4a9fe0";
            const prog = ch.programs.length ? ch.programs[liveProgramIndex(ch.programs, nowMs())] : undefined;
            const g = prog?.guide;
            const art = imageUrl(ch.id, g?.art ?? g?.thumb, 480);
            const isEpisode = !!g?.showTitle && g?.season != null && g?.episode != null;
            const title = g ? (isEpisode ? g.showTitle : g.title) : "—";
            const sub = isEpisode ? `S${g?.season} E${g?.episode}${g?.title ? ` · ${g.title}` : ""}` : undefined;
            let pct = 0;
            if (prog) {
              const s = new Date(prog.startsAt).getTime();
              pct = Math.max(0, Math.min(1, (nowMs() - s) / (prog.durationSeconds * 1000)));
            }
            const Icon = channelIcon(ch.icon ?? ch.package?.icon);
            return (
              <div
                key={ch.id}
                style={{
                  position: "absolute",
                  top: 4,
                  left: vi.start,
                  width: TILE_W,
                  transform: isFocused ? "scale(1.06)" : "scale(1)",
                  transformOrigin: "center top",
                  opacity: isFocused ? 1 : 0.5,
                  transition: "transform 0.16s ease, opacity 0.16s ease",
                }}
              >
                {/* "Watching" flag above the channel you're currently on (fixed-height slot so all
                    tiles' art stays aligned whether or not the flag is shown). */}
                <div style={{ height: 22, display: "flex", justifyContent: "center", alignItems: "flex-end", marginBottom: 6 }}>
                  {isCurrent && (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "rgba(255,255,255,0.13)", fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "rgba(255,255,255,0.9)" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: accent }} />
                      Watching
                    </div>
                  )}
                </div>
                {/* Cover art */}
                <div
                  style={{
                    width: TILE_W,
                    height: ART_H,
                    borderRadius: 12,
                    overflow: "hidden",
                    background: `${accent}22`,
                    border: `2px solid ${isFocused ? accent : "transparent"}`,
                    boxShadow: isFocused ? `0 12px 40px rgba(0,0,0,0.6)` : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {art ? (
                    <img src={art} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <Icon size={44} />
                  )}
                </div>
                {/* Progress */}
                <div style={{ height: 4, borderRadius: 999, background: "rgba(255,255,255,0.18)", marginTop: 8, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct * 100}%`, background: accent }} />
                </div>
                {/* Channel + program */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: `${accent}33`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={15} />
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 800, color: accent }}>{ch.number}</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: "#e6eaf1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ch.name}</span>
                </div>
                <div style={{ fontSize: 15, color: "#f1f5f9", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
                {sub && <div style={{ fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
