import { Button } from "@ChannelGuide/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Captions,
  ChevronUp,
  ChevronDown,
  Languages,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Rewind,
  Settings,
  SkipBack,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useChannelPlayer } from "@/features/player/use-channel-player";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/watch/$channelId")({
  staticData: { breadcrumb: "Watch" },
  component: Watch,
});

/** A piece of state mirrored to localStorage (so preferences survive reloads). */
function usePersisted(key: string, fallback: string) {
  const [v, setV] = useState<string>(() => localStorage.getItem(key) ?? fallback);
  useEffect(() => localStorage.setItem(key, v), [key, v]);
  return [v, setV] as const;
}

const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";

function Watch() {
  const { channelId } = Route.useParams();
  const navigate = useNavigate();
  const [quality, setQuality] = usePersisted("cg-quality", "original");
  const [audioLang, setAudioLang] = usePersisted("cg-audio", "");
  const [subtitleLang, setSubtitleLang] = usePersisted("cg-subtitle", "off");
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
      <div className="flex items-center justify-between gap-2">
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

      <PlayerView
        key={channelId}
        channelId={channelId}
        quality={quality}
        audioLang={audioLang}
        subtitleLang={subtitleLang}
        setQuality={setQuality}
        setAudioLang={setAudioLang}
        setSubtitleLang={setSubtitleLang}
      />
    </div>
  );
}

function PlayerView({
  channelId,
  quality,
  audioLang,
  subtitleLang,
  setQuality,
  setAudioLang,
  setSubtitleLang,
}: {
  channelId: string;
  quality: string;
  audioLang: string;
  subtitleLang: string;
  setQuality: (v: string) => void;
  setAudioLang: (v: string) => void;
  setSubtitleLang: (v: string) => void;
}) {
  const { videoRef, status, controls, tracks, loadingTimeline, timelineError } = useChannelPlayer(
    channelId,
    { quality, audioLang, subtitleLang },
  );
  const qualities = useQuery(trpc.playback.qualities.queryOptions());
  const containerRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = usePersisted("cg-volume", "1");
  const [muted, setMuted] = useState(false);
  const [isFs, setIsFs] = useState(false);

  // Apply volume/mute to the element (re-apply on each stream load).
  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.volume = Number(volume);
      v.muted = muted;
    }
  }, [volume, muted, videoRef, status.state]);

  useEffect(() => {
    const onFs = () => setIsFs(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current?.requestFullscreen();
  };

  return (
    <>
      <div ref={containerRef} className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
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

        {status.blocked && (
          <button
            onClick={controls.play}
            className="absolute inset-0 flex items-center justify-center bg-black/60 text-white"
          >
            <span className="flex flex-col items-center gap-2">
              <Play className="h-14 w-14" />
              <span className="text-sm">Click to play</span>
            </span>
          </button>
        )}

        {(loadingTimeline || status.loading) && !status.blocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-8 w-8 animate-spin text-white/80" />
          </div>
        )}

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

      {/* Transport controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
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

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => setMuted((m) => !m)} title="Mute">
            {muted || Number(volume) === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : Number(volume)}
            onChange={(e) => {
              setMuted(false);
              setVolume(e.target.value);
            }}
            className="w-24"
            title="Volume"
          />
          <Button variant="ghost" size="icon-sm" onClick={toggleFullscreen} title="Fullscreen">
            {isFs ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Stream settings */}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5 text-sm">
          <Settings className="text-muted-foreground h-4 w-4" />
          <select className={SELECT} value={quality} onChange={(e) => setQuality(e.target.value)}>
            {qualities.data?.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
        </label>

        {tracks.audio.length > 1 && (
          <label className="flex items-center gap-1.5 text-sm">
            <Languages className="text-muted-foreground h-4 w-4" />
            <select className={SELECT} value={audioLang} onChange={(e) => setAudioLang(e.target.value)}>
              <option value="">Default audio</option>
              {tracks.audio.map((t) => (
                <option key={t.lang} value={t.lang}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {tracks.subtitle.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm">
            <Captions className="text-muted-foreground h-4 w-4" />
            <select
              className={SELECT}
              value={subtitleLang}
              onChange={(e) => setSubtitleLang(e.target.value)}
            >
              <option value="off">Subtitles off</option>
              {tracks.subtitle.map((t) => (
                <option key={t.lang} value={t.lang}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {timelineError && <p className="text-destructive mt-2 text-sm">{timelineError}</p>}
      {status.error && <p className="text-destructive mt-2 text-sm">{status.error}</p>}

      {status.state === "program" && (
        <div className="mt-4 space-y-1">
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
    </>
  );
}

function formatBehind(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec ? `${m}m ${sec}s` : `${m}m`;
}
