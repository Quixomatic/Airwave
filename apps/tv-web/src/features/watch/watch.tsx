import Hls from "hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api, type MediaInfo, type NowNext } from "../../lib/api";
import { clientCaps, deviceId } from "../../lib/device";

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
  const curRef = useRef<NowNext["current"]>(null);
  const mediaRef = useRef<MediaInfo | null>(null);
  const loggedRef = useRef(false);
  const logTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [now, setNow] = useState<NowNext | null>(null);
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string>("Tuning…");
  const [vstat, setVstat] = useState<{
    w: number;
    h: number;
    rs: number;
    ct: number;
    paused: boolean;
    buf: number;
  } | null>(null);
  const [debug, setDebug] = useState(true);

  const teardown = useCallback(() => {
    if (logTimerRef.current) {
      clearTimeout(logTimerRef.current);
      logTimerRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (sessionRef.current) {
      void api.stop(channelId, sessionRef.current).catch(() => {});
      sessionRef.current = null;
    }
  }, [channelId]);

  // Record this tune's diagnostics to the DB (once per tune). Called on the
  // settle timer (playing/not-decoding) and immediately on error.
  const logResult = useCallback(
    (errMsg?: string) => {
      const cur = curRef.current;
      const m = mediaRef.current;
      if (loggedRef.current || !cur || !m) return;
      loggedRef.current = true;
      const v = videoRef.current;
      const w = v?.videoWidth ?? 0;
      const h = v?.videoHeight ?? 0;
      const outcome = errMsg ? "error" : w > 0 && h > 0 ? "playing" : "not_decoding";
      void api
        .logPlayback({
          deviceId: deviceId(),
          channelId,
          channelName,
          ratingKey: cur.ratingKey,
          title: cur.guide?.title ?? null,
          mode: m.mode,
          sourceContainer: m.container ?? null,
          sourceVideoCodec: m.videoCodec ?? null,
          sourceAudioCodec: m.audioCodec ?? null,
          decision: m.decision ?? null,
          caps: clientCaps(),
          outcome,
          decodedWidth: w,
          decodedHeight: h,
          readyState: v?.readyState ?? null,
          error: errMsg ?? null,
        })
        .catch(() => {});
    },
    [channelId, channelName],
  );

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
      const m = await api.media(channelId, cur.ratingKey, cur.offsetSeconds, clientCaps(), deviceId());
      teardown();
      sessionRef.current = m.session;
      setMedia(m);
      setNote("playing");
      play(m, cur.offsetSeconds);
      // Arm the diagnostics log for this tune (settles after ~6s of playback).
      curRef.current = cur;
      mediaRef.current = m;
      loggedRef.current = false;
      logTimerRef.current = setTimeout(() => logResult(), 6000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to tune.");
    }
  }, [channelId, play, teardown, logResult]);

  useEffect(() => {
    void resolve();
    return teardown;
  }, [resolve, teardown]);

  // Log immediately on error (don't wait for the settle timer).
  useEffect(() => {
    if (error) logResult(error);
  }, [error, logResult]);

  // Sample the real <video> state so the overlay can prove frames are decoding.
  useEffect(() => {
    const id = window.setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      setVstat({
        w: v.videoWidth,
        h: v.videoHeight,
        rs: v.readyState,
        ct: v.currentTime,
        paused: v.paused,
        buf: v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0,
      });
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  // Remote: OK toggles the debug panel; Back returns to the guide. We MUST
  // preventDefault on the webOS Back key (keyCode 461) or the platform shows its
  // own "close app?" prompt. Capture phase so we beat the default handling.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.keyCode === 461 ||
        e.key === "Backspace" ||
        e.key === "GoBack" ||
        e.key === "BrowserBack" ||
        e.key === "XF86Back"
      ) {
        e.preventDefault();
        e.stopPropagation();
        teardown();
        onExit();
      } else if (e.key === "Enter") {
        setDebug((d) => !d);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [teardown, onExit]);

  const exit = () => {
    teardown();
    onExit();
  };

  const cur = now?.current;
  const decoding = !!vstat && vstat.w > 0 && vstat.h > 0;

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

      {/* Debug overlay — proves whether frames are actually decoding (OK toggles). */}
      {debug && (
        <div className="absolute bottom-5 left-5 max-w-xl rounded-lg bg-black/85 px-4 py-3 font-mono text-sm text-zinc-200">
          <div className={`text-base font-bold ${decoding ? "text-green-400" : "text-red-400"}`}>
            {decoding ? `▶ DECODING ${vstat!.w}×${vstat!.h}` : "✖ NOT DECODING (0×0)"}
            {vstat ? (vstat.paused ? " · paused" : decoding ? " · playing" : "") : ""}
          </div>
          {media && (
            <div className="mt-1 text-zinc-400">
              source: {media.container ?? "?"} {media.videoCodec ?? "?"}/{media.audioCodec ?? "?"} ·
              mode{" "}
              <span className={media.mode === "direct" ? "text-green-400" : "text-amber-400"}>
                {media.mode}
              </span>{" "}
              · caps{" "}
              <span className={media.capsSource === "measured" ? "text-green-400" : "text-amber-400"}>
                {media.capsSource ?? "?"}
              </span>
            </div>
          )}
          {media?.decision ? (
            <div>
              plex: video{" "}
              <span className="text-amber-400">{media.decision.videoDecision ?? "?"}</span>→
              {media.decision.videoCodec ?? "?"} · audio {media.decision.audioDecision ?? "?"}→
              {media.decision.audioCodec ?? "?"} · out {media.decision.container ?? "?"}
            </div>
          ) : (
            media?.mode === "direct" && <div className="text-zinc-500">plex: direct-play (raw file)</div>
          )}
          {vstat && (
            <div className="text-zinc-400">
              readyState {vstat.rs}/4 · t={vstat.ct.toFixed(1)}s · buffered {vstat.buf.toFixed(1)}s
            </div>
          )}
          {error && <div className="mt-1 text-red-400">{error}</div>}
          <div className="mt-1 text-xs text-zinc-600">OK = toggle debug · Back = guide</div>
        </div>
      )}
    </div>
  );
}
