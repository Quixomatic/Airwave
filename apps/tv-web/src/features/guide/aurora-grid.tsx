import * as LucideIcons from "lucide-react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Menu, Settings, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { GuideGridChannel, GuideGridProgram } from "../../lib/api";

// Resolve a channel's stored icon id (`lucide:Radio`) to its component. Presets use
// lucide only; `import *` lands in the (code-split) guide chunk, not the initial load.
const LUCIDE = LucideIcons as unknown as Record<string, React.ComponentType<{ size?: number | string }>>;
function channelIcon(id?: string | null): React.ComponentType<{ size?: number | string }> {
  if (id && id.startsWith("lucide:")) return LUCIDE[id.slice(7)] ?? LucideIcons.Radio;
  return LucideIcons.Radio;
}

/**
 * The Aurora guide grid — the 10-foot live-TV guide from the Claude Design handoff
 * (proportions/style spec in .docs/tv-design-spec.md). The design is authored at 2560px
 * wide; we use it as a PROPORTION guide, not fixed pixels: the layout is a flex column
 * that fills the viewport (the grid expands into leftover height), text/spacing are `vw`
 * (so they scale with screen width), and the horizontal time-grid is computed from the
 * ACTUAL lane width — so it fits whatever screen it's on.
 */

const DESIGN_W = 2560;
/** spec px (at 2560 wide) → vw, so sizing scales fluidly with the screen. */
const vw = (px: number) => `${(px / DESIGN_W) * 100}vw`;

const C = {
  bg: "#060a14",
  card: "#0b1120",
  border: "rgba(148,163,184,0.14)",
  cellBorder: "rgba(148,163,184,0.10)",
  rowBorder: "rgba(148,163,184,0.12)",
  fg: "#f1f5f9",
  mutedFg: "#94a3b8",
  ring: "#3b82f6",
  highlight: "#12233d",
  now: "#ef4444",
  star: "#f0a92a",
  navBg: "#0f1626",
  navActive: "#243043",
};
const ACCENTS = ["#2f9e8f", "#4a9fe0", "#3b82f6", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e", "#7c8aa3"];

const CH_FRAC = 212 / DESIGN_W; // channel rail = this fraction of width
const ROW_FRAC = 168 / DESIGN_W; // row height fraction (of width)
// The featured panel, sized purely off width, dominates a 16:9 panel (~60% tall).
// Shrink it uniformly so the grid gets the majority of the vertical space.
const FEATURE_SCALE = 0.58;
const WINDOW_MIN = 180; // minutes of timeline shown across the lane
const LEAD_MIN = 30; // minutes of "already aired" shown before the grid start
const MIN = 60_000;

const accentOf = (i: number) => ACCENTS[i % ACCENTS.length]!;
const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });

function subLine(g: GuideGridProgram["guide"]): string {
  const parts: string[] = [];
  if (g.season != null && g.episode != null) parts.push(`S${g.season}, E${g.episode}`);
  if (g.contentRating) parts.push(g.contentRating);
  if (g.durationMs) parts.push(`${Math.round(g.durationMs / 60000)}m`);
  return parts.join(" · ");
}
const audioBadge = (ch?: number) => (ch === 8 ? "7.1" : ch === 6 ? "5.1" : ch === 2 ? "Stereo" : ch ? "Mono" : null);
const isHD = (res?: string) => !!res && res !== "sd" && res !== "480";
const is4K = (res?: string) => res === "4k";

export function AuroraGrid({
  channels,
  serverTime,
  onTune,
  onSettings,
}: {
  channels: GuideGridChannel[];
  serverTime: string;
  onTune: (channelId: string) => void;
  onSettings: () => void;
}) {
  const now = useMemo(() => new Date(serverTime), [serverTime]);
  const T0 = useMemo(() => {
    const d = new Date(now.getTime() - LEAD_MIN * MIN);
    const m = d.getMinutes();
    d.setMinutes(m >= 31 ? 31 : m >= 1 ? 1 : -29, 0, 0);
    return d;
  }, [now]);

  // Measure the actual width so the time-grid fills the real lane (fully responsive).
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1920));
  useEffect(() => {
    const f = () => setWidth(window.innerWidth);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  const railPx = width * CH_FRAC;
  const rowPx = width * ROW_FRAC;
  const laneW = width - railPx;
  const ppm = laneW / WINDOW_MIN; // px per minute, derived from the real lane width
  const minsFrom = (iso: string | Date) =>
    ((typeof iso === "string" ? new Date(iso).getTime() : iso.getTime()) - T0.getTime()) / MIN;
  const laneX = (iso: string | Date) => minsFrom(iso) * ppm; // px within the lane (0 = T0)
  const nowMins = minsFrom(now);

  const [fc, setFc] = useState(0);
  const [fp, setFp] = useState(0);
  const cursorRef = useRef<number>(now.getTime());
  const scrollRef = useRef<HTMLDivElement>(null);

  const focusedChannel = channels[fc];
  const focusedProgram = focusedChannel?.programs[fp];

  useEffect(() => {
    const p = channels[fc]?.programs[fp];
    if (p) cursorRef.current = new Date(p.startsAt).getTime() + (p.durationSeconds * 1000) / 2;
  }, [fc, fp, channels]);

  const pickAtCursor = (chIdx: number) => {
    const progs = channels[chIdx]?.programs ?? [];
    if (!progs.length) return 0;
    const cur = cursorRef.current;
    const containing = progs.findIndex(
      (p) => new Date(p.startsAt).getTime() <= cur && new Date(p.startsAt).getTime() + p.durationSeconds * 1000 > cur,
    );
    if (containing >= 0) return containing;
    let best = 0;
    let bestD = Infinity;
    progs.forEach((p, i) => {
      const mid = new Date(p.startsAt).getTime() + (p.durationSeconds * 1000) / 2;
      const d = Math.abs(mid - cur);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Back at the guide root (webOS remote → keyCode 461, keyboard → Backspace):
      // exit the app via the webOS platform back (no-op off-device).
      if (e.keyCode === 461 || ["Backspace", "GoBack", "BrowserBack", "XF86Back"].includes(e.key)) {
        e.preventDefault();
        (window as unknown as { webOS?: { platformBack?: () => void } }).webOS?.platformBack?.();
        return;
      }
      const n = channels.length;
      if (!n) return;
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          setFp((p) => Math.min((focusedChannel?.programs.length ?? 1) - 1, p + 1));
          break;
        case "ArrowLeft":
          e.preventDefault();
          setFp((p) => Math.max(0, p - 1));
          break;
        case "ArrowDown": {
          e.preventDefault();
          const nc = Math.min(n - 1, fc + 1);
          setFc(nc);
          setFp(pickAtCursor(nc));
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const nc = Math.max(0, fc - 1);
          setFc(nc);
          setFp(pickAtCursor(nc));
          break;
        }
        case "Enter":
          e.preventDefault();
          if (focusedChannel) onTune(focusedChannel.id);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [channels, fc, focusedChannel, onTune]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = fc * rowPx;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowPx > el.scrollTop + el.clientHeight) el.scrollTop = top + rowPx - el.clientHeight;
  }, [fc, rowPx]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: C.bg,
        color: C.fg,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Helvetica, Arial, sans-serif',
      }}
    >
      <NavPill onSettings={onSettings} />
      {focusedChannel && focusedProgram ? (
        <FeaturedPanel channel={focusedChannel} program={focusedProgram} now={now} accent={accentOf(fc)} />
      ) : (
        <div style={{ height: vw(600) }} />
      )}
      <TimeHeader T0={T0} railFrac={CH_FRAC} laneX={laneX} />

      {/* Grid area — flex:1 so it fills all remaining height on any screen. */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div ref={scrollRef} style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden" }}>
          {channels.map((c, ci) => (
            <Row
              key={c.id}
              channel={c}
              accent={accentOf(ci)}
              focused={ci === fc}
              focusedProgramId={ci === fc ? focusedProgram?.id : undefined}
              now={now}
              rowPx={rowPx}
              railFrac={CH_FRAC}
              laneX={laneX}
              laneW={laneW}
              ppm={ppm}
              minsFrom={minsFrom}
            />
          ))}
        </div>
        {nowMins >= 0 && nowMins <= WINDOW_MIN && (
          <>
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: railPx + laneX(now),
                width: 3,
                background: C.now,
                boxShadow: `0 0 12px ${C.now}`,
                zIndex: 6,
                pointerEvents: "none",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: railPx + laneX(now) - vwNum(width, 10.5),
                width: vw(21),
                height: vw(21),
                borderRadius: "50%",
                background: C.now,
                boxShadow: `0 0 12px ${C.now}`,
                zIndex: 7,
                animation: "tvgPulse 2s ease-in-out infinite",
              }}
            />
          </>
        )}
      </div>

      <div
        style={{ position: "absolute", bottom: vw(22), left: vw(40), display: "flex", gap: vw(26), color: "#475569", fontSize: vw(24), zIndex: 8 }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ChevronLeft size="1em" />
          <ChevronRight size="1em" /> programs
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ChevronUp size="1em" />
          <ChevronDown size="1em" /> channels
        </span>
        <span>OK to watch</span>
      </div>
      <style>{`@keyframes tvgPulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
    </div>
  );
}

/** spec px → device px at the current width (for exact left-offsets). */
const vwNum = (width: number, px: number) => (px / DESIGN_W) * width;

function NavPill({ onSettings }: { onSettings: () => void }) {
  const tab = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: vw(16),
    padding: `${vw(16)} ${vw(40)}`,
    borderRadius: 999,
    fontSize: vw(32),
    fontWeight: 600,
    color: active ? "#f1f5f9" : "#94a3b8",
    background: active ? C.navActive : "transparent",
    cursor: "pointer",
    border: "none",
    transition: "all .12s",
  });
  return (
    <div
      style={{
        alignSelf: "center",
        marginTop: vw(56),
        display: "flex",
        alignItems: "center",
        background: C.navBg,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: vw(6),
        boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
        zIndex: 20,
        flexShrink: 0,
      }}
    >
      <button style={tab(true)}>
        <Menu size="1em" /> Guide
      </button>
      <button style={tab(false)} onClick={onSettings}>
        <Settings size="1em" /> Settings
      </button>
    </div>
  );
}

function TimeHeader({
  T0,
  railFrac,
  laneX,
}: {
  T0: Date;
  railFrac: number;
  laneX: (iso: string | Date) => number;
}) {
  const ticks = Array.from({ length: Math.ceil(WINDOW_MIN / 30) + 1 }, (_, i) => new Date(T0.getTime() + i * 30 * MIN));
  return (
    <div style={{ position: "relative", height: vw(52), flexShrink: 0, marginTop: vw(20) }}>
      <div style={{ position: "absolute", left: vw(40), top: vw(6), fontSize: vw(32), fontWeight: 600, color: "#e6eaf1" }}>
        {fmtDay(T0)}
      </div>
      <div style={{ position: "absolute", left: `${railFrac * 100}%`, right: 0, top: 0, bottom: 0 }}>
        {ticks.map((t, i) => (
          <div
            key={i}
            style={{ position: "absolute", left: laneX(t), top: vw(6), fontSize: vw(32), fontWeight: 600, color: "#c3c9d4", whiteSpace: "nowrap" }}
          >
            {fmtTime(t)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({
  channel,
  accent,
  focused,
  focusedProgramId,
  now,
  rowPx,
  railFrac,
  laneX,
  laneW,
  ppm,
  minsFrom,
}: {
  channel: GuideGridChannel;
  accent: string;
  focused: boolean;
  focusedProgramId?: string;
  now: Date;
  rowPx: number;
  railFrac: number;
  laneX: (iso: string | Date) => number;
  laneW: number;
  ppm: number;
  minsFrom: (iso: string | Date) => number;
}) {
  return (
    <div
      style={{
        position: "relative",
        height: rowPx,
        display: "flex",
        borderTop: `1px solid ${C.rowBorder}`,
        background: focused ? "rgba(59,130,246,0.06)" : "transparent",
      }}
    >
      <div
        style={{
          width: `${railFrac * 100}%`,
          flexShrink: 0,
          padding: `${vw(18)} ${vw(20)}`,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: focused ? "rgba(59,130,246,0.10)" : "transparent",
          boxShadow: focused ? `inset 4px 0 0 ${C.ring}` : "none",
        }}
      >
        {/* top: tinted channel icon left, channel number pushed right — same height */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: vw(34) }}>
          <span
            style={{
              width: vw(34),
              height: vw(34),
              borderRadius: "50%",
              background: hexA(accent, 0.2),
              color: accent,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: vw(20),
            }}
          >
            {(() => {
              const Icon = channelIcon(channel.icon ?? channel.package?.icon);
              return <Icon size="1em" />;
            })()}
          </span>
          <span style={{ fontSize: vw(34), lineHeight: 1, fontWeight: 700, color: "#e6eaf1", display: "flex", alignItems: "center", height: vw(34) }}>
            {channel.number}
          </span>
        </div>
        {/* bottom: full name, left-aligned, clamped to 2 lines */}
        <div
          style={{
            fontSize: vw(23),
            color: C.mutedFg,
            lineHeight: 1.2,
            textAlign: "left",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {channel.name}
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, height: rowPx, overflow: "hidden" }}>
        {channel.programs
          .filter((p) => {
            const start = minsFrom(p.startsAt);
            const end = start + p.durationSeconds / 60;
            return end > 0 && start < WINDOW_MIN;
          })
          .map((p) => {
            const selected = p.id === focusedProgramId;
            // Only the program that's actually airing right now gets the channel-accent
            // left bar (a broadcast "on air" cue); everything else stays plain.
            const startMs = new Date(p.startsAt).getTime();
            const live = now.getTime() >= startMs && now.getTime() < startMs + p.durationSeconds * 1000;
            // A program that started before the grid's left edge (T0) would render
            // way off-screen to the left, hiding its title. Clamp its left to the rail
            // and shrink the width by the clipped amount — leaving the same tiny 6px
            // gap the blocks have between each other, so it isn't butted flush.
            const rawLeft = laneX(p.startsAt);
            const rawRight = rawLeft + Math.max(laneW * 0.02, (p.durationSeconds / 60) * ppm) - 6;
            const left = rawLeft < 0 ? 6 : rawLeft;
            const width = rawRight - left;
            return (
              <div
                key={p.id}
                style={{
                  position: "absolute",
                  top: vw(6),
                  left,
                  width,
                  height: `calc(100% - ${vw(12)})`,
                  padding: `${vw(20)} ${vw(20)} 0`,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  borderRadius: 8,
                  border: selected ? `2px solid ${C.ring}` : `1px solid ${C.cellBorder}`,
                  borderLeft: live
                    ? `4px solid ${accent}`
                    : selected
                      ? `2px solid ${C.ring}`
                      : `1px solid ${C.cellBorder}`,
                  background: selected ? C.highlight : hexA(accent, 0.09),
                  boxShadow: selected ? "0 0 0 2px rgba(59,130,246,0.4), 0 12px 30px rgba(0,0,0,0.5)" : "none",
                  zIndex: selected ? 4 : 1,
                  transition: "background .12s",
                }}
              >
                <div style={{ fontSize: vw(34), fontWeight: 600, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.guide.showTitle ?? p.guide.title}
                </div>
                <div style={{ marginTop: vw(12), fontSize: vw(26), color: C.mutedFg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {subLine(p.guide)}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function FeaturedPanel({
  channel,
  program,
  now,
  accent,
}: {
  channel: GuideGridChannel;
  program: GuideGridProgram;
  now: Date;
  accent: string;
}) {
  const g = program.guide;
  const start = new Date(program.startsAt);
  const end = new Date(start.getTime() + program.durationSeconds * 1000);
  let status = "";
  let pct = 0;
  if (now < start) status = `Starts ${fmtTime(start)}`;
  else if (now >= end) {
    status = "Ended";
    pct = 100;
  } else {
    status = `${Math.round((end.getTime() - now.getTime()) / MIN)}m left`;
    pct = Math.round(((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100);
  }
  const audio = audioBadge(g.audioChannels);
  // For an episode: lead with the SHOW name, then "S1, E2 · Episode Title".
  // For a movie: just the title.
  const isEpisode = !!g.showTitle && g.season != null && g.episode != null;
  // Featured panel scales off width but is uniformly shrunk (FEATURE_SCALE) so it
  // doesn't dominate the vertical space — the grid below gets the majority.
  const fv = (px: number) => vw(px * FEATURE_SCALE);
  const badge: React.CSSProperties = { fontSize: fv(30), fontWeight: 700, padding: `${fv(6)} ${fv(16)}`, borderRadius: 8 };

  return (
    <div style={{ display: "flex", gap: fv(56), alignItems: "flex-start", padding: `${fv(40)} ${fv(64)} 0`, flexShrink: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: fv(22) }}>
          <span style={{ width: fv(64), height: fv(64), borderRadius: "50%", background: hexA(accent, 0.9), border: `1px solid ${C.border}`, flexShrink: 0 }} />
          <span style={{ fontSize: fv(44), fontWeight: 700, color: "#8f97a6" }}>{channel.number}</span>
          <span style={{ fontSize: fv(44), fontWeight: 700, color: "#e9edf5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {channel.name}
          </span>
        </div>
        {(g.genres?.length || g.tagline) && (
          <div style={{ marginTop: fv(14), fontSize: fv(30), color: "#64748b" }}>
            {[g.genres?.slice(0, 2).join(" · "), g.tagline].filter(Boolean).join(" · ")}
          </div>
        )}
        <div style={{ height: 1, background: C.border, margin: `${fv(22)} 0 ${fv(26)}` }} />

        <div style={{ display: "flex", alignItems: "center", gap: fv(28) }}>
          <div style={{ flex: 1, fontSize: fv(60), fontWeight: 700, letterSpacing: "-0.5px", lineHeight: 1.05, minWidth: 0 }}>
            {isEpisode ? g.showTitle : g.title}
            {isEpisode && (
              <span style={{ fontWeight: 400, color: "#c3c9d4" }}>
                {" "}
                S{g.season}, E{g.episode}
                {g.title ? ` · ${g.title}` : ""}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: fv(14), flexShrink: 0 }}>
            {is4K(g.resolution) ? (
              <span style={{ ...badge, background: "#7fd6de", color: "#06222a" }}>4K</span>
            ) : isHD(g.resolution) ? (
              <span style={{ ...badge, background: "#7fd6de", color: "#06222a" }}>HD</span>
            ) : null}
            {audio && <span style={{ ...badge, background: "#1e293b", color: "#dfe4ec" }}>{audio}</span>}
          </div>
        </div>

        <div style={{ marginTop: fv(22), display: "flex", alignItems: "center", gap: fv(16), fontSize: fv(34), color: "#c3c9d4" }}>
          {g.year && <span>{g.year}</span>}
          {g.year && g.contentRating && <span style={{ color: "#475569" }}>·</span>}
          {g.contentRating && <span>{g.contentRating}</span>}
          {g.criticRating != null && (
            <>
              <span style={{ color: "#475569" }}>·</span>
              <Star size="1em" color={C.star} fill={C.star} />
              <span>{g.criticRating.toFixed(1)}</span>
            </>
          )}
        </div>

        {g.summary && (
          <div style={{ marginTop: fv(22), fontSize: fv(36), lineHeight: 1.4, color: "#c9cfda", maxWidth: fv(1560), display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {g.summary}
          </div>
        )}

        <div style={{ marginTop: fv(26), display: "flex", justifyContent: "space-between", fontSize: fv(34), color: "#c3c9d4" }}>
          <span>
            {fmtTime(start)} - {fmtTime(end)}
          </span>
          <span style={{ color: "#e6eaf1" }}>{status}</span>
        </div>
        <div style={{ marginTop: fv(16), height: fv(8), borderRadius: 999, background: "rgba(148,163,184,0.18)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 999, background: "#dfe4ec", width: `${pct}%`, transition: "width .2s" }} />
        </div>
      </div>

      <div style={{ width: fv(820), aspectRatio: "16 / 9", borderRadius: 14, overflow: "hidden", background: C.card, border: `1px solid ${C.cellBorder}`, flexShrink: 0 }} />
    </div>
  );
}
