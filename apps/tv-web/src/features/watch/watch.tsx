import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api, type MediaInfo, type NowNext } from "../../lib/api";
import { clientCaps } from "../../lib/device";

/**
 * Minimal "tune and play what's on now" — the H2 webOS capability probe. Resolves
 * the current program at its live offset and plays it (hls.js or native), with a
 * diagnostics readout of exactly what the panel was asked to decode (mode /
 * container / codecs). The full effectiveTime state machine (rollover, DVR) is
 * H3 (ported into packages/client-core); this proves playback + surfaces codec
 * behavior on the actual TV.
 */
export function Watch({
  channelId,
  channelName,
  onExit,
}: {
  channelId: string;
  channelName: string;
  onExit: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionRef = useRef<string | null>(null);

  const [now, setNow] = useState<NowNext | null>(null);
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string>("Tuning…");

  const teardown = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (sessionRef.current) {
      void api.stop(channelId, sessionRef.current).catch(() => {});
      sessionRef.current = null;
    }
  }, [channelId]);

  const play = useCallback((m: MediaInfo, offsetSeconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    if (m.mode === "hls") {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(m.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) setError(`HLS fatal: ${data.type} / ${data.details}`);
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = m.url; // native HLS (some TVs / Safari)
        void video.play().catch(() => {});
      } else {
        setError("This player can't play HLS.");
      }
    } else {
      // Direct-play the original file; seek to the live offset once ready.
      video.src = m.url;
      const onMeta = () => {
        video.currentTime = offsetSeconds;
        void video.play().catch(() => {});
        video.removeEventListener("loadedmetadata", onMeta);
      };
      video.addEventListener("loadedmetadata", onMeta);
    }
  }, []);

  const resolve = useCallback(async () => {
    setError(null);
    try {
      const nn = await api.now(channelId);
      setNow(nn);
      const cur = nn.current;
      if (!cur) {
        setNote("Nothing scheduled right now.");
        return;
      }
      if (cur.kind === "BUMPER" || !cur.ratingKey) {
        teardown();
        setMedia(null);
        setNote("bumper");
        const remainingMs = Math.max(1000, (cur.durationSeconds - cur.offsetSeconds) * 1000);
        window.setTimeout(() => void resolve(), remainingMs);
        return;
      }
      const m = await api.media(channelId, cur.ratingKey, cur.offsetSeconds, clientCaps());
      teardown();
      sessionRef.current = m.session;
      setMedia(m);
      setNote("playing");
      play(m, cur.offsetSeconds);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to tune.");
    }
  }, [channelId, play, teardown]);

  useEffect(() => {
    void resolve();
    return teardown;
  }, [resolve, teardown]);

  const exit = () => {
    teardown();
    onExit();
  };

  const cur = now?.current;

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        className="h-full w-full"
        controls
        playsInline
        onEnded={() => void resolve()}
        onError={() => {
          const e = videoRef.current?.error;
          if (e) setError(`Video error ${e.code}: ${e.message || "decode/playback failed"}`);
        }}
      />

      {/* Bumper interstitial card */}
      {note === "bumper" && cur && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
          <p className="text-2xl text-zinc-400">We'll be right back…</p>
          {cur.guide.title && (
            <p className="text-4xl font-semibold">Up next: {cur.guide.title}</p>
          )}
        </div>
      )}

      {/* Top bar: back + channel */}
      <div className="absolute left-0 top-0 flex w-full items-center gap-4 bg-gradient-to-b from-black/70 to-transparent p-5">
        <button onClick={exit} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
          ← Guide
        </button>
        <span className="text-lg font-medium">{channelName}</span>
        {cur?.guide.title && <span className="text-zinc-400">· {cur.guide.title}</span>}
      </div>

      {error && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg bg-red-950/90 px-4 py-2 text-red-200">
          {error}
        </div>
      )}

      {/* Probe diagnostics — what the panel was asked to decode */}
      {media && (
        <div className="absolute bottom-5 left-5 rounded-lg bg-black/70 px-4 py-3 font-mono text-xs text-zinc-300">
          <div>
            mode: <span className="text-amber-400">{media.mode}</span>
            {media.mode === "hls" && " (Plex transcode)"}
            {media.mode === "direct" && " (original file)"}
          </div>
          <div>
            container: {media.container ?? "?"} · video: {media.videoCodec ?? "?"} · audio:{" "}
            {media.audioCodec ?? "?"}
          </div>
          <div>
            audio tracks: {media.audioTracks.length} · subtitle tracks:{" "}
            {media.subtitleTracks.length}
          </div>
        </div>
      )}
    </div>
  );
}
