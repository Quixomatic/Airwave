import { Button } from "@ChannelGuide/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  Loader2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Rewind,
  SkipBack,
} from "lucide-react";

import { useChannelPlayer } from "@/features/player/use-channel-player";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/watch/$channelId")({
  staticData: { breadcrumb: "Watch" },
  component: Watch,
});

function Watch() {
  const { channelId } = Route.useParams();
  const navigate = useNavigate();
  const { videoRef, status, controls, loadingTimeline, timelineError } =
    useChannelPlayer(channelId);
  const channels = useQuery(trpc.channels.list.queryOptions());

  const enabled = (channels.data ?? []).filter((c) => c.enabled);
  const idx = enabled.findIndex((c) => c.id === channelId);
  const surf = (dir: 1 | -1) => {
    if (enabled.length === 0) return;
    const next = enabled[(idx + dir + enabled.length) % enabled.length]!;
    navigate({ to: "/watch/$channelId", params: { channelId: next.id } });
  };
  const current = enabled[idx];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/channels/$channelId"
          params={{ channelId }}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Channel
        </Link>
        <div className="flex items-center gap-2">
          {current && (
            <span className="text-sm font-medium">
              <span className="text-muted-foreground tabular-nums">{current.number}</span>{" "}
              {current.name}
              {current.callsign && (
                <span className="text-muted-foreground ml-2 font-mono text-xs">
                  {current.callsign}
                </span>
              )}
            </span>
          )}
          <Button variant="outline" size="icon-sm" onClick={() => surf(-1)} title="Channel up">
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => surf(1)} title="Channel down">
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Video stage */}
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
        <video ref={videoRef} playsInline className="h-full w-full bg-black" />

        {status.state === "bumper" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-black/80 via-black/70 to-black/90 text-center text-white">
            <p className="text-sm uppercase tracking-[0.2em] text-white/60">We'll be right back</p>
            {status.nextTitle && (
              <p className="max-w-lg px-6 text-2xl font-semibold">
                <span className="text-white/60">Up next · </span>
                {status.nextTitle}
              </p>
            )}
            {status.bumperRemaining != null && (
              <p className="text-4xl font-bold tabular-nums text-white/90">
                {status.bumperRemaining}
              </p>
            )}
          </div>
        )}

        {status.state === "off" && !loadingTimeline && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-center text-sm text-white/70">
            Nothing on now — generate a schedule for this channel.
          </div>
        )}

        {(loadingTimeline || status.loading) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-8 w-8 animate-spin text-white/80" />
          </div>
        )}

        {/* Live / behind-live badge */}
        <div className="absolute right-3 top-3">
          {status.isLive ? (
            <span className="inline-flex items-center gap-1 rounded bg-red-600/90 px-2 py-0.5 text-xs font-semibold uppercase text-white">
              <Radio className="h-3 w-3" /> Live
            </span>
          ) : (
            <span className="rounded bg-black/70 px-2 py-0.5 text-xs font-medium text-white/90">
              {formatBehind(status.delaySeconds)} behind
            </span>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={controls.togglePause}>
          {status.paused ? <Play className="mr-1 h-4 w-4" /> : <Pause className="mr-1 h-4 w-4" />}
          {status.paused ? "Play" : "Pause"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => controls.rewind(60)}>
          <Rewind className="mr-1 h-4 w-4" /> 1m
        </Button>
        <Button variant="outline" size="sm" onClick={() => controls.rewind(15)}>
          <Rewind className="mr-1 h-4 w-4" /> 15s
        </Button>
        <Button variant="outline" size="sm" onClick={controls.restart} title="Restart from beginning">
          <SkipBack className="mr-1 h-4 w-4" /> Restart
        </Button>
        <Button
          variant={status.isLive ? "outline" : "default"}
          size="sm"
          onClick={controls.jumpToLive}
          disabled={status.isLive}
        >
          <RotateCcw className="mr-1 h-4 w-4" /> Jump to Live
        </Button>
      </div>

      {timelineError && <p className="text-destructive text-sm">{timelineError}</p>}
      {status.error && <p className="text-destructive text-sm">{status.error}</p>}

      {/* Now / next readout */}
      {status.state === "program" && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">On now</p>
          <p className="text-lg font-semibold">
            {status.title}
            {status.subtitle && (
              <span className="text-muted-foreground ml-2 text-sm">{status.subtitle}</span>
            )}
          </p>
          {status.summary && (
            <p className="text-muted-foreground line-clamp-2 max-w-2xl text-sm">{status.summary}</p>
          )}
          {status.nextTitle && (
            <p className="text-muted-foreground pt-1 text-sm">Up next · {status.nextTitle}</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatBehind(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec ? `${m}m ${sec}s` : `${m}m`;
}
