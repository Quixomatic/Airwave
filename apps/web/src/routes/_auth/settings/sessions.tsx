import type { AppRouter } from "@ChannelGuide/api/routers/index";
import { Badge } from "@ChannelGuide/ui/components/badge";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { inferRouterOutputs } from "@trpc/server";
import { Monitor, Radio, Tv, User } from "lucide-react";

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
          <FramePanel className="text-muted-foreground flex items-center justify-center py-10 text-sm">
            No one's watching right now.
          </FramePanel>
        ) : (
          <div className="flex flex-wrap gap-2">
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
        <FramePanel className="divide-border divide-y p-0">
          {recent.length === 0 ? (
            <div className="text-muted-foreground flex items-center justify-center py-10 text-sm">
              No play logs yet.
            </div>
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
  // Fixed ~1/3-ish tile that wraps (Plex-style cards), not a full-width stretch.
  return (
    <FramePanel className="divide-border w-full min-w-0 divide-y p-0 sm:w-80">
      {/* Media: art (natural ratio, small) | title, SxEy · episode title, progress, channel */}
      <div className="flex gap-3 p-4">
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
                  s.season != null && s.episode != null
                    ? `S${s.season} · E${s.episode}`
                    : null,
                  s.showTitle ? s.title : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || (s.year ? String(s.year) : "")}
              </p>
            )}
            <div className="mt-2">
              <Progress s={s} />
            </div>
            {s.channel && (
              <p className="text-muted-foreground mt-2 text-xs">
                Ch {s.channel.number} · {s.channel.name}
                {s.channel.callsign ? ` (${s.channel.callsign})` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Device + connection */}
        <div className="space-y-1.5 p-4">
          <DetailRow icon={<Monitor className="size-3.5" />} label="Device">
            {s.device ? (s.device.model ?? s.device.platform ?? s.device.id) : "—"}
          </DetailRow>
          <DetailRow icon={<Radio className="size-3.5" />} label="Connection">
            <ConnectionBadge connection={s.connection} />
          </DetailRow>
        </div>

        {/* Streams: video / audio / subtitles */}
        <div className="space-y-1.5 p-4">
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
    <div className="space-y-1">
      {p && (
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="text-muted-foreground flex items-center justify-between text-[11px]">
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

/** copy = Direct Play (emerald); transcode = Transcode (amber). */
function StreamBadge({ decision, codec }: { decision: string | null; codec: string | null }) {
  if (!decision && !codec) return <span className="text-muted-foreground">—</span>;
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
  if (!connection) return <span className="text-muted-foreground">—</span>;
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
  const art = l.channelId && l.ratingKey ? channelImg(l.channelId, `/library/metadata/${l.ratingKey}/thumb`, null) : null;
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
