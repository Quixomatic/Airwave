import { Skeleton } from "@airwave/ui/components/skeleton";
import { accentTint } from "@airwave/ui/lib/accent-palette";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Star, Tv } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { resolveTile } from "@/features/icons/app-icon";

/**
 * The admin guide, rebuilt on the TV app's **Aurora** design (aurora-grid.tsx in apps/tv-web) so the
 * two feel familiar — a featured now-playing panel over a horizontal time-grid with tinted "on now"
 * cells and a pulsing now-marker. This is a LOOK-PORT, not shared code: the TV is REST + D-pad zones
 * + a fixed dark palette; this is tRPC + mouse (hover drives the featured panel, click tunes) +
 * theme-aware tokens. The subtle geometry (lane math, program clamping, two-tone progress fill) is
 * carried over verbatim; only the palette, input model, and sizing base differ.
 *
 * Styling split (this is the admin, so static styling is Tailwind): everything that DOESN'T scale is
 * a class — flex/position/overflow, rounding, cursor, truncation, font-weight, theme text colors.
 * What stays inline is only what's genuinely dynamic: the width-scaled sizes/spacing (the `u()`
 * helper — the TV's fluid 2560px-authored proportions, measured off the real container width since
 * the guide sits beside the app nav sidebar), per-channel accent fills (`hexA` — a channel's teal is
 * teal in either theme), and time-derived positions (program left/width, the now-marker, progress).
 */

// The guide's data shape mirrors the shared `getGuideGrid` service (packages/api/src/services/guide.ts).
type GuideMeta = {
  title: string;
  year?: number;
  contentRating?: string;
  summary?: string;
  tagline?: string;
  genres?: string[];
  criticRating?: number;
  durationMs?: number;
  resolution?: string;
  audioChannels?: number;
  hdr?: string;
  dynamicAudio?: string;
  showTitle?: string;
  season?: number;
  episode?: number;
};
export type GuideProgram = {
  id: string;
  ratingKey: string | null;
  startsAt: string | Date;
  durationSeconds: number;
  guide: GuideMeta;
};
export type GuideChannel = {
  id: string;
  number: number;
  name: string;
  callsign: string | null;
  icon: string | null;
  tint: string | null;
  package: { id: string; icon: string | null; tint: string | null } | null;
  programs: GuideProgram[];
};
export type GuideData = {
  serverTime: string | Date;
  windowMinutes: number;
  channels: GuideChannel[];
};

const DESIGN_W = 2560;
const CH_FRAC = 212 / DESIGN_W; // channel rail = this fraction of width
const ROW_FRAC = 168 / DESIGN_W; // row height fraction (of width)
const FEATURE_SCALE = 0.76; // uniformly shrink the featured panel so the grid keeps room
const WINDOW_MIN = 180; // minutes of timeline shown across the lane
const LEAD_MIN = 30; // minutes of "already aired" shown before the grid start
const MIN = 60_000;
const MIN_VISIBLE_PX = 24; // cull rail-edge program slivers
// Broadcast "live" red for the now-marker (kept literal so it reads the same in light + dark).
const NOW = "#ef4444";
const STAR = "#f0a92a";
const RING = "#3b82f6"; // constant blue focus outline (TV parity), independent of the accent
const PROGRESS_FILL_ELAPSED_STRONGER = true;
// Divider/cell borders set INLINE (not via a Tailwind class): the elements use the `border`/`borderTop`
// shorthand, which resets border-color to `currentColor` and — being inline — outranks any class, so a
// class color needs !important. A `--foreground`-based mix stays subtle in both themes (unlike the
// `--border` token, which is opaque in light mode and reads as a hard line).
const BORDER_ROW = "color-mix(in oklab, var(--foreground) 11%, transparent)";
const BORDER_CELL = "color-mix(in oklab, var(--foreground) 14%, transparent)";

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" });

function subLine(g: GuideMeta): string {
  const parts: string[] = [];
  if (g.season != null && g.episode != null) parts.push(`S${g.season}, E${g.episode}`);
  if (g.contentRating) parts.push(g.contentRating);
  if (g.durationMs) parts.push(`${Math.round(g.durationMs / 60000)}m`);
  return parts.join(" · ");
}
const audioBadge = (ch?: number) => (ch === 8 ? "7.1" : ch === 6 ? "5.1" : ch === 2 ? "Stereo" : ch ? "Mono" : null);
const isHD = (res?: string) => !!res && res !== "sd" && res !== "480";
const is4K = (res?: string) => res === "4k";
const BADGE_GRAD = {
  res: "linear-gradient(90deg, #7fd6de, #4bb8c9)",
  hdr: "linear-gradient(90deg, #f0c14b, #e0a020)",
  audio: "linear-gradient(90deg, #1e293b, #334155)",
} as const;

/** A channel's icon + hex accent tint (own, else its package's; slate fallback). */
function channelTile(c: GuideChannel) {
  const t = resolveTile({
    icon: c.icon,
    tint: c.tint,
    inheritedIcon: c.package?.icon,
    inheritedTint: c.package?.tint,
    defaultIcon: Tv,
  });
  return { Icon: t.Icon, accent: accentTint(t.tint) };
}

/** Index of the program airing at `nowMs` (else 0) — the "on now" slot. */
function liveProgramIndex(programs: GuideProgram[], nowMs: number): number {
  const i = programs.findIndex((p) => {
    const s = new Date(p.startsAt).getTime();
    return nowMs >= s && nowMs < s + p.durationSeconds * 1000;
  });
  return i >= 0 ? i : 0;
}

export function AuroraGuide({
  data,
  onTune,
  rightSlot,
  forceEmpty = false,
}: {
  data: GuideData;
  onTune: (channelId: string) => void;
  /** Fills the featured panel's right column (where the TV docks its mini feed) — the admin's
   *  "Now watching" panel. */
  rightSlot?: React.ReactNode;
  /** Force the skeleton/empty layout regardless of data (for previewing the empty state). */
  forceEmpty?: boolean;
}) {
  const now = useMemo(() => new Date(data.serverTime), [data.serverTime]);
  const T0 = useMemo(() => {
    const d = new Date(now.getTime() - LEAD_MIN * MIN);
    const m = d.getMinutes();
    d.setMinutes(m >= 31 ? 31 : m >= 1 ? 1 : -29, 0, 0);
    return d;
  }, [now]);

  // Measure the real content width (the guide sits beside the app nav sidebar, so window width
  // is wrong) and scale the 2560-authored proportions off it.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w) setContainerW(w);
    });
    ro.observe(el);
    setContainerW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const channels = data.channels;

  // Featured panel is driven by hover (the mouse analog of D-pad focus); defaults to the first
  // channel's on-now program. `sel` is {channel index, program index}.
  const [sel, setSel] = useState<{ c: number; p: number }>({ c: 0, p: 0 });
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current || !channels.length) return;
    const progs = channels[0]?.programs ?? [];
    if (!progs.length) return;
    didInit.current = true;
    setSel({ c: 0, p: liveProgramIndex(progs, now.getTime()) });
  }, [channels, now]);

  const W = containerW;
  const railPx = W * CH_FRAC;
  const rowPx = W * ROW_FRAC;
  const laneW = Math.max(1, W - railPx);
  const ppm = laneW / WINDOW_MIN;
  const minsFrom = (iso: string | Date) =>
    ((typeof iso === "string" ? new Date(iso).getTime() : iso.getTime()) - T0.getTime()) / MIN;
  const laneX = (iso: string | Date) => minsFrom(iso) * ppm;
  const nowMins = minsFrom(now);
  const u = (px: number) => (px / DESIGN_W) * W; // spec px → container px

  const rowVirtualizer = useVirtualizer({
    count: channels.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowPx,
    overscan: 8,
  });
  useEffect(() => rowVirtualizer.measure(), [rowPx, rowVirtualizer]);

  const featuredChannel = channels[sel.c] ?? channels[0];
  const featuredProgram = featuredChannel?.programs[sel.p] ?? featuredChannel?.programs[0];
  const showSkeleton = forceEmpty || !(featuredChannel && featuredProgram);

  return (
    <div ref={containerRef} className="text-foreground flex h-full flex-col overflow-hidden">
      {W > 0 && showSkeleton && (
        <GuideSkeleton T0={T0} railPx={railPx} rowPx={rowPx} laneW={laneW} laneX={laneX} u={u} hasRightSlot={!!rightSlot} />
      )}
      {W > 0 && !showSkeleton && featuredChannel && featuredProgram && (
        <>
          <FeaturedPanel channel={featuredChannel} program={featuredProgram} now={now} u={u} rightSlot={rightSlot} />
          <TimeHeader T0={T0} railPx={railPx} laneX={laneX} u={u} />

          <div className="relative min-h-0 flex-1">
            <div ref={scrollRef} className="cg-aurora-scroll absolute inset-0 overflow-y-auto overflow-x-hidden">
              <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map((vi) => {
                  const c = channels[vi.index]!;
                  return (
                    <div
                      key={c.id}
                      className="absolute left-0 top-0 w-full"
                      style={{ height: rowPx, transform: `translateY(${vi.start}px)` }}
                    >
                      <Row
                        channel={c}
                        selected={vi.index === sel.c}
                        selectedProgramId={vi.index === sel.c ? featuredProgram.id : undefined}
                        now={now}
                        rowPx={rowPx}
                        railPx={railPx}
                        laneX={laneX}
                        laneW={laneW}
                        ppm={ppm}
                        minsFrom={minsFrom}
                        u={u}
                        onHoverProgram={(p) => setSel({ c: vi.index, p })}
                        onHoverRail={() => setSel({ c: vi.index, p: liveProgramIndex(c.programs, now.getTime()) })}
                        onTune={() => onTune(c.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            {nowMins >= 0 && nowMins <= WINDOW_MIN && (
              <div
                // Pulsing downward triangle capping the current time — the whole now-marker (the
                // full vertical line is intentionally omitted, as on the TV).
                className="pointer-events-none absolute z-[7]"
                style={{
                  top: -u(14),
                  left: railPx + laneX(now),
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: `${u(9)}px solid transparent`,
                  borderRight: `${u(9)}px solid transparent`,
                  borderTop: `${u(14)}px solid ${NOW}`,
                  filter: `drop-shadow(0 0 6px ${NOW})`,
                  animation: "cgAuroraPulse 2s ease-in-out infinite",
                }}
              />
            )}
          </div>
        </>
      )}
      <style>{`@keyframes cgAuroraPulse{0%,100%{opacity:1}50%{opacity:.55}}.cg-aurora-scroll{scrollbar-width:thin}`}</style>
    </div>
  );
}

function TimeHeader({
  T0,
  railPx,
  laneX,
  u,
}: {
  T0: Date;
  railPx: number;
  laneX: (iso: string | Date) => number;
  u: (px: number) => number;
}) {
  const ticks = Array.from({ length: Math.ceil(WINDOW_MIN / 30) + 1 }, (_, i) => new Date(T0.getTime() + i * 30 * MIN));
  return (
    <div className="relative shrink-0" style={{ height: u(52), marginTop: u(40), marginBottom: u(20) }}>
      <div className="text-foreground absolute font-semibold" style={{ left: u(40), top: u(6), fontSize: u(32) }}>
        {fmtDay(T0)}
      </div>
      <div className="absolute inset-y-0 right-0" style={{ left: railPx }}>
        {ticks.map((t, i) => (
          <div
            key={i}
            className="text-muted-foreground absolute whitespace-nowrap font-semibold"
            style={{ left: laneX(t), top: u(6), fontSize: u(32) }}
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
  selected,
  selectedProgramId,
  now,
  rowPx,
  railPx,
  laneX,
  laneW,
  ppm,
  minsFrom,
  u,
  onHoverProgram,
  onHoverRail,
  onTune,
}: {
  channel: GuideChannel;
  selected: boolean;
  selectedProgramId?: string;
  now: Date;
  rowPx: number;
  railPx: number;
  laneX: (iso: string | Date) => number;
  laneW: number;
  ppm: number;
  minsFrom: (iso: string | Date) => number;
  u: (px: number) => number;
  onHoverProgram: (programIndex: number) => void;
  onHoverRail: () => void;
  onTune: () => void;
}) {
  const { Icon, accent } = channelTile(channel);
  return (
    <div
      // Faint row divider (also the first line just under the time axis). Color set inline — see
      // BORDER_ROW.
      className="relative flex"
      style={{ height: rowPx, borderTop: `1px solid ${BORDER_ROW}` }}
    >
      {/* Rail — tinted icon tile + number, and the channel name. Hovering it features the channel's
          on-now program; clicking tunes. */}
      <div
        onMouseEnter={onHoverRail}
        onClick={onTune}
        className="flex shrink-0 cursor-pointer flex-col justify-between"
        style={{
          width: railPx,
          padding: `${u(18)}px ${u(20)}px`,
          background: selected ? hexA(accent, 0.12) : "transparent",
          boxShadow: selected ? `inset ${u(4)}px 0 0 ${accent}` : "none",
        }}
      >
        <div className="flex items-start justify-between" style={{ gap: u(8) }}>
          <span
            className="flex shrink-0 items-center justify-center rounded-full"
            style={{
              width: u(64 * FEATURE_SCALE),
              height: u(64 * FEATURE_SCALE),
              background: hexA(accent, 0.2),
              border: `1px solid ${hexA(accent, 0.35)}`,
              color: accent,
              fontSize: u(34 * FEATURE_SCALE),
            }}
          >
            {/* resolveTile's IconComponent is typed for className only (no `size`); the SVG scales
                to the span's font-size via a 1em box. */}
            <Icon className="size-[1em]" />
          </span>
          <span
            className={"tabular-nums font-bold leading-none " + (selected ? "text-foreground" : "text-muted-foreground")}
            style={{ fontSize: u(34) }}
          >
            {channel.number}
          </span>
        </div>
        <div className="text-muted-foreground line-clamp-2 text-left" style={{ fontSize: u(23), lineHeight: 1.2 }}>
          {channel.name}
        </div>
      </div>

      {/* Lane — the program blocks. Only the airing one carries the channel tint (two-tone progress
          fill); the rest read neutral, showing selection via the blue focus outline. */}
      <div className="relative flex-1 overflow-hidden" style={{ height: rowPx }}>
        {channel.programs.map((p, idx) => {
          const start = minsFrom(p.startsAt);
          const end = start + p.durationSeconds / 60;
          if (!(end > 0 && start < WINDOW_MIN)) return null;
          const rawLeft = laneX(p.startsAt);
          const rawRight = rawLeft + Math.max(laneW * 0.02, (p.durationSeconds / 60) * ppm) - 6;
          const left = rawLeft < 0 ? 6 : rawLeft;
          const width = rawRight - left;
          if (width < MIN_VISIBLE_PX) return null;

          const startMs = new Date(p.startsAt).getTime();
          const live = now.getTime() >= startMs && now.getTime() < startMs + p.durationSeconds * 1000;
          const isSel = p.id === selectedProgramId;
          const fillPct = Math.max(0, Math.min(100, ((laneX(now) - left) / width) * 100));
          const [fillA, fillB] = PROGRESS_FILL_ELAPSED_STRONGER
            ? [hexA(accent, 0.32), hexA(accent, 0.1)]
            : [hexA(accent, 0.1), hexA(accent, 0.32)];
          const liveFill = `linear-gradient(90deg, ${fillA} ${fillPct}%, ${fillB} ${fillPct}%)`;
          return (
            <div
              key={p.id}
              onMouseEnter={() => onHoverProgram(idx)}
              onClick={onTune}
              className={"absolute cursor-pointer overflow-hidden rounded-lg " + (isSel ? "z-[4]" : "z-[1]")}
              style={{
                top: u(6),
                left,
                width,
                height: `calc(100% - ${u(12)}px)`,
                border: `1px solid ${BORDER_CELL}`,
                background: live ? liveFill : hexA(accent, 0.05),
                // The TV's focus halo: a crisp 2px blue outline hugging the block (offset inward so
                // it isn't clipped), plus a soft lift.
                outline: isSel ? `2px solid ${RING}` : "none",
                outlineOffset: isSel ? -2 : 0,
                boxShadow: isSel ? "0 0 0 4px rgba(59,130,246,0.25), 0 12px 30px rgba(0,0,0,0.35)" : "none",
                transition: "background .12s, outline-color .12s",
              }}
            >
              {live && (
                <div
                  className="absolute bottom-2.5 left-[3px] top-2.5 z-[2] w-[3px] rounded"
                  style={{ background: accent }}
                />
              )}
              <div className="h-full" style={{ padding: `${u(20)}px ${u(20)}px 0` }}>
                <div className="text-foreground truncate font-semibold" style={{ fontSize: u(34) }}>
                  {p.guide.showTitle ?? p.guide.title}
                </div>
                <div className="text-muted-foreground truncate" style={{ marginTop: u(12), fontSize: u(26) }}>
                  {subLine(p.guide)}
                </div>
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
  u,
  rightSlot,
}: {
  channel: GuideChannel;
  program: GuideProgram;
  now: Date;
  u: (px: number) => number;
  rightSlot?: React.ReactNode;
}) {
  const g = program.guide;
  const { Icon, accent } = channelTile(channel);
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
  const isEpisode = !!g.showTitle && g.season != null && g.episode != null;
  const fv = (px: number) => u(px * FEATURE_SCALE);
  const badgeCls = "rounded-lg font-bold";
  const badge: React.CSSProperties = { fontSize: fv(30), padding: `${fv(6)}px ${fv(16)}px` };

  return (
    <div className="flex shrink-0 items-start" style={{ gap: fv(56), padding: `${fv(40)}px ${fv(64)}px 0` }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center" style={{ gap: fv(22) }}>
          <span
            className="flex shrink-0 items-center justify-center rounded-full"
            style={{
              width: fv(64),
              height: fv(64),
              background: hexA(accent, 0.2),
              border: `1px solid ${hexA(accent, 0.35)}`,
              color: accent,
              fontSize: fv(34),
            }}
          >
            <Icon className="size-[1em]" />
          </span>
          <span className="tabular-nums font-bold" style={{ fontSize: fv(44), color: hexA(accent, 0.85) }}>
            {channel.number}
          </span>
          <span className="truncate font-bold" style={{ fontSize: fv(44), color: accent }}>
            {channel.name}
          </span>
        </div>
        {(g.genres?.length || g.tagline) && (
          <div className="text-muted-foreground" style={{ marginTop: fv(14), fontSize: fv(30) }}>
            {[g.genres?.slice(0, 2).join(" · "), g.tagline].filter(Boolean).join(" · ")}
          </div>
        )}
        <div className="bg-border h-px" style={{ margin: `${fv(22)}px 0 ${fv(26)}px` }} />

        <div className="flex items-center" style={{ gap: fv(28) }}>
          <div
            className="text-foreground min-w-0 flex-1 font-bold"
            style={{ fontSize: fv(60), letterSpacing: "-0.5px", lineHeight: 1.05 }}
          >
            {isEpisode ? g.showTitle : g.title}
            {isEpisode && (
              <span className="text-muted-foreground font-normal">
                {" "}
                S{g.season}, E{g.episode}
                {g.title ? ` · ${g.title}` : ""}
              </span>
            )}
          </div>
          <div className="flex shrink-0" style={{ gap: fv(14) }}>
            {is4K(g.resolution) ? (
              <span className={badgeCls} style={{ ...badge, background: BADGE_GRAD.res, color: "#06222a" }}>4K</span>
            ) : isHD(g.resolution) ? (
              <span className={badgeCls} style={{ ...badge, background: BADGE_GRAD.res, color: "#06222a" }}>HD</span>
            ) : null}
            {g.hdr && (
              <span className={badgeCls} style={{ ...badge, background: BADGE_GRAD.hdr, color: "#2a1e00" }}>
                {g.hdr === "Dolby Vision" ? "DV" : "HDR"}
              </span>
            )}
            {audio && (
              <span className={badgeCls} style={{ ...badge, background: BADGE_GRAD.audio, color: "#dfe4ec" }}>
                {audio}
              </span>
            )}
            {g.dynamicAudio && (
              <span className={badgeCls} style={{ ...badge, background: BADGE_GRAD.audio, color: "#dfe4ec" }}>
                {g.dynamicAudio === "Atmos" ? "ATMOS" : g.dynamicAudio}
              </span>
            )}
          </div>
        </div>

        <div className="text-muted-foreground flex items-center" style={{ marginTop: fv(22), gap: fv(16), fontSize: fv(34) }}>
          {g.year && <span>{g.year}</span>}
          {g.year && g.contentRating && <span className="opacity-50">·</span>}
          {g.contentRating && <span>{g.contentRating}</span>}
          {g.criticRating != null && (
            <>
              <span className="opacity-50">·</span>
              <Star size={fv(30)} color={STAR} fill={STAR} />
              <span>{g.criticRating.toFixed(1)}</span>
            </>
          )}
        </div>

        <div
          className="text-muted-foreground line-clamp-2"
          style={{ marginTop: fv(22), fontSize: fv(36), lineHeight: 1.4, minHeight: fv(36 * 1.4 * 2) }}
        >
          {g.summary ?? ""}
        </div>

        <div className="text-muted-foreground flex justify-between" style={{ marginTop: fv(26), fontSize: fv(34) }}>
          <span>
            {fmtTime(start)} - {fmtTime(end)}
          </span>
          <span className="text-foreground">{status}</span>
        </div>
        <div className="overflow-hidden rounded-full" style={{ marginTop: fv(16), height: fv(8), background: hexA(accent, 0.18) }}>
          <div className="h-full rounded-full" style={{ background: accent, width: `${pct}%`, transition: "width .2s" }} />
        </div>
      </div>

      {/* The TV docks its persistent mini feed here; the admin fills it with "Now watching". */}
      {rightSlot && <div className="shrink-0 self-stretch" style={{ width: fv(970) }}>{rightSlot}</div>}
    </div>
  );
}

// Skeleton lane layouts — fractional [left-accumulating] widths that tile the lane, cycled per row so
// the empty grid reads like a populated one rather than a blank rectangle.
const SKELETON_PATTERNS = [
  [0.18, 0.3, 0.22, 0.3],
  [0.35, 0.2, 0.25, 0.2],
  [0.12, 0.4, 0.18, 0.3],
  [0.28, 0.28, 0.44],
  [0.5, 0.22, 0.28],
  [0.2, 0.2, 0.35, 0.25],
  [0.4, 0.15, 0.25, 0.2],
];
const SKELETON_ROWS = 14;

/** Static (non-animated) placeholder — the empty guide has many, so the shimmer is turned OFF for
 *  performance (the animated gradient uses a `fixed`-attachment background). A centered message sits
 *  over them. */
function Ghost({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <Skeleton animate={false} className={className} style={style} />;
}

/**
 * The empty-state layout — the guide's own structure rendered as (static) placeholders (featured
 * panel + the REAL time axis + tiled program rows) with a centered "no channels" message floating
 * over the grid, so a fresh install still looks like the guide it's about to become.
 */
function GuideSkeleton({
  T0,
  railPx,
  rowPx,
  laneW,
  laneX,
  u,
  hasRightSlot,
}: {
  T0: Date;
  railPx: number;
  rowPx: number;
  laneW: number;
  laneX: (iso: string | Date) => number;
  u: (px: number) => number;
  hasRightSlot: boolean;
}) {
  const fv = (px: number) => u(px * FEATURE_SCALE);
  return (
    <>
      {/* Featured panel skeleton */}
      <div className="flex shrink-0 items-start" style={{ gap: fv(56), padding: `${fv(40)}px ${fv(64)}px 0` }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center" style={{ gap: fv(22) }}>
            <Ghost className="rounded-full" style={{ width: fv(64), height: fv(64) }} />
            <Ghost style={{ width: fv(64), height: fv(44) }} />
            <Ghost style={{ width: fv(340), height: fv(44), maxWidth: "50%" }} />
          </div>
          <Ghost style={{ marginTop: fv(18), width: fv(280), height: fv(30), maxWidth: "40%" }} />
          <div className="bg-border h-px" style={{ margin: `${fv(22)}px 0 ${fv(26)}px` }} />
          <Ghost style={{ width: fv(760), height: fv(60), maxWidth: "75%" }} />
          <Ghost style={{ marginTop: fv(22), width: fv(320), height: fv(34), maxWidth: "45%" }} />
          <Ghost style={{ marginTop: fv(24), width: "100%", height: fv(34) }} />
          <Ghost style={{ marginTop: fv(12), width: "86%", height: fv(34) }} />
          <div className="flex justify-between" style={{ marginTop: fv(28) }}>
            <Ghost style={{ width: fv(190), height: fv(34) }} />
            <Ghost style={{ width: fv(120), height: fv(34) }} />
          </div>
          <Ghost className="rounded-full" style={{ marginTop: fv(16), width: "100%", height: fv(8) }} />
        </div>
        {hasRightSlot && <Ghost className="self-stretch rounded-xl" style={{ width: fv(970) }} />}
      </div>

      {/* The real time axis — it needs no channels, and anchoring the skeleton to it looks intentional. */}
      <TimeHeader T0={T0} railPx={railPx} laneX={laneX} u={u} />

      {/* Tiled skeleton rows, with the empty message centered over them. */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {Array.from({ length: SKELETON_ROWS }, (_, i) => {
          const pattern = SKELETON_PATTERNS[i % SKELETON_PATTERNS.length]!;
          let acc = 0;
          const blocks = pattern.map((frac) => {
            const left = acc * laneW + (acc === 0 ? 0 : 3);
            const width = frac * laneW - 6;
            acc += frac;
            return { left, width };
          });
          return (
            <div key={i} className="flex" style={{ height: rowPx, borderTop: `1px solid ${BORDER_ROW}` }}>
              <div
                className="flex shrink-0 flex-col justify-between"
                style={{ width: railPx, padding: `${u(18)}px ${u(20)}px` }}
              >
                <div className="flex items-start justify-between" style={{ gap: u(8) }}>
                  <Ghost className="rounded-full" style={{ width: u(64 * FEATURE_SCALE), height: u(64 * FEATURE_SCALE) }} />
                  <Ghost style={{ width: u(28), height: u(28) }} />
                </div>
                <Ghost style={{ width: "82%", height: u(20) }} />
              </div>
              <div className="relative flex-1 overflow-hidden" style={{ height: rowPx }}>
                {blocks.map((b, j) =>
                  b.width < MIN_VISIBLE_PX ? null : (
                    <Ghost
                      key={j}
                      className="absolute rounded-lg"
                      style={{ top: u(6), left: b.left, width: b.width, height: `calc(100% - ${u(12)}px)` }}
                    />
                  ),
                )}
              </div>
            </div>
          );
        })}

        {/* Centered empty-state message, floating over the ghosted grid. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="bg-background/80 pointer-events-auto max-w-sm rounded-2xl border px-8 py-6 text-center shadow-md backdrop-blur-[2px]">
            <Tv className="text-muted-foreground mx-auto mb-3 h-8 w-8" strokeWidth={1.5} />
            <p className="font-semibold">No channels yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Channels you create will show up here in the guide — build one to get started.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
