import type { AppRouter } from "@airwave/api/routers/index";
import { Badge } from "@airwave/ui/components/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { History, Monitor, Radio, Tv, User } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { channelImg } from "@/lib/img";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/sessions")({
  staticData: { breadcrumb: "Sessions" },
  component: SettingsSessions,
});

type Outputs = inferRouterOutputs<AppRouter>;
type ActiveSession = Outputs["playback"]["sessions"][number];
type RecentLog = Outputs["playback"]["recentLogs"][number];

function SettingsSessions() {
  // Active sessions are live — poll every 5s (same cadence as the guide's session chip).
  const sessions = useQuery({
    ...trpc.playback.sessions.queryOptions(),
    refetchInterval: 5000,
  });
  const logs = useQuery(trpc.playback.recentLogs.queryOptions({ limit: 40 }));

  const active = sessions.data ?? [];
  const recent = logs.data ?? [];

  return (
    <div className="space-y-4">
      <Frame>
        <FrameHeader>
          <FrameTitle>Active sessions</FrameTitle>
          <FrameDescription>
            Who's watching right now, what's playing, and how it's being delivered (direct play vs
            transcode, connection, and device) — our in-house version of Plex's Now&nbsp;Playing.
          </FrameDescription>
        </FrameHeader>
        {active.length === 0 ? (
          <FramePanel className="p-0">
            <EmptyState
              icon={Tv}
              title="No one's watching"
              description="Active viewing sessions show up here in real time."
            />
          </FramePanel>
        ) : (
          // Fixed 20rem columns; each tile is a subgrid spanning the shared rows so its sections line up
          // across neighboring tiles (media/progress/device/streams/viewer align row-for-row).
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,20rem)]">
            {active.map((s) => (
              <SessionTile key={s.id} s={s} />
            ))}
          </div>
        )}
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Recent sessions &amp; play logs</FrameTitle>
          <FrameDescription>
            The last tunes across all devices — what played, how Plex decided to deliver it, and whether
            the panel actually decoded frames.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="divide-border max-h-[32rem] divide-y overflow-y-auto p-0">
          {recent.length === 0 ? (
            <EmptyState
              icon={History}
              title="No play logs yet"
              description="Playback attempts across devices will appear here."
            />
          ) : (
            recent.map((l) => <LogRow key={l.id} l={l} />)
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}

/** One active session, laid out Plex-style: media header → device/connection → streams → viewer. */
function SessionTile({ s }: { s: ActiveSession }) {
  const art = s.channelId ? channelImg(s.channelId, s.thumbPath, null) : null;
  const onBreak = s.state === "bumper";
  // Subgrid tile: its 5 sections (media, progress, device, streams, viewer) snap to the container's shared
  // row lines, so those sections align pixel-for-pixel across neighboring tiles. row-span must match the
  // section count below. gap-y-0: a subgrid inherits the parent grid's row-gap, which would insert gaps
  // between the sections (exposing the panel bg) — override it to 0 so the sections touch; the parent keeps
  // its gap between tiles.
  return (
    <FramePanel className="row-span-5 grid min-w-0 gap-y-0 [grid-template-rows:subgrid] divide-border divide-y p-0">
      {/* Media: portrait poster | title, SxEy · episode; channel below */}
      <div className="p-4">
        <div className="flex gap-3">
          {art ? (
            <img src={art} alt="" className="h-24 w-auto shrink-0 self-start rounded-md" />
          ) : (
            <div className="bg-muted text-muted-foreground flex h-24 w-16 shrink-0 items-center justify-center rounded-md">
              <Tv className="size-6" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {onBreak ? "On a break" : (s.showTitle ?? s.title ?? "—")}
            </p>
            {!onBreak && (s.showTitle || s.season != null || s.episode != null) && (
              <p className="text-muted-foreground mt-0.5 truncate text-xs">
                {[
                  s.season != null && s.episode != null ? `S${s.season} · E${s.episode}` : null,
                  s.showTitle ? s.title : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || (s.year ? String(s.year) : "")}
              </p>
            )}
          </div>
        </div>
        {s.channel && (
          <p className="text-muted-foreground mt-3 text-xs">
            Ch {s.channel.number} · {s.channel.name}
            {s.channel.callsign ? ` (${s.channel.callsign})` : ""}
          </p>
        )}
      </div>

      {/* Program progress — full-width band between the media header and the device info */}
      <Progress s={s} />

        {/* Device + connection */}
        <div className="bg-muted/40 space-y-1.5 p-4">
          <DetailRow icon={<Monitor className="size-3.5" />} label="Device">
            {s.device ? (s.device.model ?? s.device.platform ?? s.device.id) : "Unknown"}
          </DetailRow>
          <DetailRow icon={<Radio className="size-3.5" />} label="Connection">
            <ConnectionBadge connection={s.connection} />
          </DetailRow>
        </div>

        {/* Streams: video / audio / subtitles */}
        <div className="bg-muted/40 space-y-1.5 p-4">
          <DetailRow label="Video">
            <StreamBadge decision={s.video?.decision ?? null} codec={s.video?.codec ?? null} />
          </DetailRow>
          <DetailRow label="Audio">
            <StreamBadge decision={s.audio?.decision ?? null} codec={s.audio?.codec ?? null} />
          </DetailRow>
          <DetailRow label="Subtitles">
            <span className="text-muted-foreground text-xs">None</span>
          </DetailRow>
        </div>

        {/* Who */}
        <div className="p-4">
          <DetailRow icon={<User className="size-3.5" />} label="Watching">
            <span className="font-medium">{s.user}</span>
          </DetailRow>
        </div>
    </FramePanel>
  );
}

/** Program progress bar + Live/behind indicator (reuses the guide chip's live/behind semantics). */
function Progress({ s }: { s: ActiveSession }) {
  const live = s.delaySeconds < 5;
  const p = s.progress;
  const pct = p && p.durationSeconds > 0 ? Math.min(100, (p.positionSeconds / p.durationSeconds) * 100) : 0;
  return (
    <div>
      {p && (
        <div className="bg-muted h-1.5 w-full overflow-hidden">
          <div className="bg-primary h-full" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="text-muted-foreground flex items-center justify-between px-4 py-2 text-[11px]">
        <span>{p ? `${fmtDuration(p.positionSeconds)} / ${fmtDuration(p.durationSeconds)}` : ""}</span>
        <span>
          {live ? (
            <span className="font-semibold uppercase text-red-500">● Live</span>
          ) : (
            `${fmtBehind(s.delaySeconds)} behind`
          )}
        </span>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, children }: { icon?: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

// Muted "Unknown" chip — used for every missing chip value so rows keep a consistent height across tiles.
const MUTED_BADGE = "border-muted-foreground/20 bg-muted text-muted-foreground";
function UnknownBadge() {
  return (
    <Badge variant="outline" className={MUTED_BADGE}>
      Unknown
    </Badge>
  );
}

/** copy = Direct Play (emerald); transcode = Transcode (amber). */
function StreamBadge({ decision, codec }: { decision: string | null; codec: string | null }) {
  if (!decision && !codec) return <UnknownBadge />;
  const transcode = decision === "transcode";
  return (
    <Badge
      variant="outline"
      className={
        transcode
          ? "gap-1 border-amber-500/30 bg-amber-500/15 text-amber-600"
          : "gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
      }
    >
      {transcode ? "Transcode" : "Direct Play"}
      {codec ? <span className="opacity-70">· {codec.toUpperCase()}</span> : null}
    </Badge>
  );
}

function ConnectionBadge({ connection }: { connection: string | null }) {
  if (!connection) return <UnknownBadge />;
  const cls =
    connection === "local"
      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-600"
      : connection === "relay"
        ? "border-amber-500/30 bg-amber-500/15 text-amber-600"
        : "border-sky-500/30 bg-sky-500/15 text-sky-600";
  return (
    <Badge variant="outline" className={`capitalize ${cls}`}>
      {connection}
    </Badge>
  );
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return null;
  const map: Record<string, { label: string; cls: string }> = {
    playing: { label: "Playing", cls: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600" },
    not_decoding: { label: "No frames", cls: "border-amber-500/30 bg-amber-500/15 text-amber-600" },
    error: { label: "Error", cls: "border-red-500/30 bg-red-500/15 text-red-600" },
  };
  const m = map[outcome] ?? { label: outcome, cls: "border-muted bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={m.cls}>
      {m.label}
    </Badge>
  );
}

/** One recent play-log row — a compact line with art, media, delivery badges, outcome, viewer, time. */
function LogRow({ l }: { l: RecentLog }) {
  const decision = l.decision;
  const art = l.channelId ? channelImg(l.channelId, l.thumbPath, null) : null;
  return (
    <div className="flex items-center gap-3 p-3">
      {art ? (
        <img src={art} alt="" className="h-12 w-auto shrink-0 rounded" />
      ) : (
        <div className="bg-muted text-muted-foreground flex h-12 w-9 shrink-0 items-center justify-center rounded">
          <Tv className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{l.title ?? "—"}</p>
        <p className="text-muted-foreground truncate text-xs">
          {l.channelName ?? "—"}
          {l.decodedWidth && l.decodedHeight ? ` · ${l.decodedWidth}×${l.decodedHeight}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <OutcomeBadge outcome={l.outcome} />
          <StreamBadge decision={decision?.videoDecision ?? null} codec={l.sourceVideoCodec} />
          <StreamBadge decision={decision?.audioDecision ?? null} codec={l.sourceAudioCodec} />
          <ConnectionBadge connection={l.connection} />
        </div>
        {l.error ? <p className="mt-1 truncate text-xs text-red-500">{l.error}</p> : null}
      </div>
      <div className="text-muted-foreground shrink-0 text-right text-xs">
        <p className="font-medium text-foreground">{l.user}</p>
        <p>{relTime(l.createdAt)}</p>
      </div>
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

function fmtBehind(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m`;
}

function relTime(value: string | Date): string {
  const then = new Date(value).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
