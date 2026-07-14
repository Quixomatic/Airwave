import Hls from "hls.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, api, type MediaInfo, type NowNext } from "../../lib/api";
import { clientCaps, deviceId } from "../../lib/device";

/**
 * Tune and play what's on now, with the admin-preview parity controls: audio-track
 * switch, burned subtitles, and the quality ladder — all re-resolve the current
 * program with the new option (server forces the matching transcode). Playback is
 * native-first (direct/http) with hls.js as the runtime fallback (see the ladder in
 * getPlaybackInfo). The full effectiveTime DVR state machine is still a follow-up.
 */
type Options = { quality: string; audioLang?: string; subtitleLang?: string };

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
  const retriedRef = useRef(false);

  const [now, setNow] = useState<NowNext | null>(null);
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string>("Tuning…");
  const [vstat, setVstat] = useState<{ w: number; h: number; rs: number; ct: number; paused: boolean; buf: number } | null>(null);
  const [debug, setDebug] = useState(false);

  // Parity controls. `optionsRef` mirrors the state so the (stable) resolve() reads the
  // current selection without being re-created on every change.
  const [quality, setQuality] = useState("original");
  const [audioLang, setAudioLang] = useState<string | undefined>(undefined);
  const [subtitleLang, setSubtitleLang] = useState<string | undefined>(undefined);
  const optionsRef = useRef<Options>({ quality, audioLang, subtitleLang });
  useEffect(() => {
    optionsRef.current = { quality, audioLang, subtitleLang };
  }, [quality, audioLang, subtitleLang]);

  const noteRef = useRef(note);
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const [qualities, setQualities] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    api.qualities().then((r) => setQualities(r.qualities)).catch(() => {});
  }, []);

  const [controlsOpen, setControlsOpen] = useState(false);
  const [cfocus, setCfocus] = useState({ col: 0, row: 0 });

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
        video.src = m.url;
        void video.play().catch(() => {});
      } else {
        setError("This player can't play HLS.");
      }
    } else if (m.mode === "http") {
      // Progressive transcode — offset baked in server-side, play from 0 (no seek).
      video.src = m.url;
      void video.play().catch(() => {});
    } else {
      // direct: raw part file — seek to the live offset once metadata is ready.
      video.src = m.url;
      const onMeta = () => {
        video.currentTime = offsetSeconds;
        void video.play().catch(() => {});
        video.removeEventListener("loadedmetadata", onMeta);
      };
      video.addEventListener("loadedmetadata", onMeta);
    }
  }, []);

  const resolve = useCallback(
    async (forceHls = false) => {
      setError(null);
      if (!forceHls) retriedRef.current = false;
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
        const o = optionsRef.current;
        const m = await api.media(channelId, cur.ratingKey, cur.offsetSeconds, {
          caps: clientCaps(),
          deviceId: deviceId(),
          forceHls,
          quality: o.quality,
          audioLang: o.audioLang,
          subtitleLang: o.subtitleLang,
        });
        teardown();
        sessionRef.current = m.session;
        setMedia(m);
        setNote("playing");
        play(m, cur.offsetSeconds);
        curRef.current = cur;
        mediaRef.current = m;
        loggedRef.current = false;
        logTimerRef.current = setTimeout(() => logResult(), 6000);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to tune.");
      }
    },
    [channelId, play, teardown, logResult],
  );

  useEffect(() => {
    void resolve();
    return teardown;
  }, [resolve, teardown]);

  // Watch-session heartbeat — powers "Now Watching" and lets watch-session-reap stop
  // orphaned transcodes. ~every 10s + immediately on (re)arm; the minimal player is at
  // live so delaySeconds is 0 (DVR position tracking lands with the effectiveTime machine).
  const heartbeat = useCallback(() => {
    const cur = curRef.current;
    const state = noteRef.current === "bumper" ? "bumper" : cur ? "program" : "off";
    void api
      .heartbeat({
        channelId,
        state,
        ratingKey: cur?.ratingKey ?? null,
        title: cur?.guide?.title ?? null,
        delaySeconds: 0,
        positionAt: null,
        transcodeSession: sessionRef.current,
      })
      .catch(() => {});
  }, [channelId]);

  useEffect(() => {
    heartbeat();
    const id = window.setInterval(heartbeat, 10_000);
    return () => window.clearInterval(id);
  }, [heartbeat]);

  // End the watch session when leaving the player entirely (not on channel switch).
  useEffect(() => {
    return () => {
      void api.endSession().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (error) logResult(error);
  }, [error, logResult]);

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

  // Selecting an option updates the ref immediately then re-resolves at the current
  // program with the new option (server forces the matching transcode).
  const selectAudio = (lang: string) => {
    optionsRef.current.audioLang = lang;
    setAudioLang(lang);
    void resolve();
  };
  const selectSub = (lang: string | undefined) => {
    optionsRef.current.subtitleLang = lang;
    setSubtitleLang(lang);
    void resolve();
  };
  const selectQuality = (id: string) => {
    optionsRef.current.quality = id;
    setQuality(id);
    void resolve();
  };

  // The three control columns (built from the current media's tracks + the ladder).
  const cols = useMemo(() => {
    const audio = (media?.audioTracks ?? []).map((t) => ({
      label: t.label,
      selected: audioLang === t.lang,
      onSelect: () => selectAudio(t.lang),
    }));
    const subs = [
      { label: "Off", selected: !subtitleLang || subtitleLang === "off", onSelect: () => selectSub("off") },
      ...(media?.subtitleTracks ?? []).map((t) => ({
        label: t.label,
        selected: subtitleLang === t.lang,
        onSelect: () => selectSub(t.lang),
      })),
    ];
    const qual = qualities.map((q) => ({
      label: q.label,
      selected: quality === q.id,
      onSelect: () => selectQuality(q.id),
    }));
    return [
      { key: "audio", title: "Audio", items: audio.length ? audio : [{ label: "—", selected: true, onSelect: () => {} }] },
      { key: "subs", title: "Subtitles", items: subs },
      { key: "quality", title: "Quality", items: qual.length ? qual : [{ label: "—", selected: true, onSelect: () => {} }] },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, qualities, audioLang, subtitleLang, quality]);
  const colsRef = useRef(cols);
  colsRef.current = cols;
  const cfocusRef = useRef(cfocus);
  cfocusRef.current = cfocus;

  // Remote handling. Controls open → navigate the panel; closed → OK/Up opens it,
  // Back exits. MUST preventDefault the webOS Back key (461) in capture phase.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isBack =
        e.keyCode === 461 || ["Backspace", "GoBack", "BrowserBack", "XF86Back"].includes(e.key);
      if (controlsOpen) {
        if (isBack) {
          e.preventDefault();
          e.stopPropagation();
          setControlsOpen(false);
          return;
        }
        const colLen = (ci: number) => colsRef.current[ci]?.items.length ?? 1;
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault();
            setCfocus((f) => {
              const col = Math.max(0, f.col - 1);
              return { col, row: Math.min(f.row, colLen(col) - 1) };
            });
            break;
          case "ArrowRight":
            e.preventDefault();
            setCfocus((f) => {
              const col = Math.min(colsRef.current.length - 1, f.col + 1);
              return { col, row: Math.min(f.row, colLen(col) - 1) };
            });
            break;
          case "ArrowUp":
            e.preventDefault();
            setCfocus((f) => ({ ...f, row: Math.max(0, f.row - 1) }));
            break;
          case "ArrowDown":
            e.preventDefault();
            setCfocus((f) => ({ ...f, row: Math.min(colLen(f.col) - 1, f.row + 1) }));
            break;
          case "Enter":
            e.preventDefault();
            colsRef.current[cfocusRef.current.col]?.items[cfocusRef.current.row]?.onSelect();
            break;
          default:
            break;
        }
        return;
      }
      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        teardown();
        onExit();
      } else if (e.key === "Enter" || e.key === "ArrowUp") {
        e.preventDefault();
        setCfocus({ col: 0, row: 0 });
        setControlsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [controlsOpen, teardown, onExit]);

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
        playsInline
        onEnded={() => void resolve()}
        onError={() => {
          const e = videoRef.current?.error;
          if (mediaRef.current && mediaRef.current.mode !== "hls" && !retriedRef.current) {
            retriedRef.current = true;
            setNote("native failed → hls fallback");
            void resolve(true);
            return;
          }
          if (e) setError(`Video error ${e.code}: ${e.message || "decode/playback failed"}`);
        }}
      />

      {note === "bumper" && cur && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
          <p className="text-2xl text-zinc-400">We'll be right back…</p>
          {cur.guide.title && <p className="text-4xl font-semibold">Up next: {cur.guide.title}</p>}
        </div>
      )}

      {/* Top bar */}
      <div className="absolute left-0 top-0 flex w-full items-center gap-4 bg-gradient-to-b from-black/70 to-transparent p-5">
        <button onClick={exit} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">
          ← Guide
        </button>
        <span className="text-lg font-medium">{channelName}</span>
        {cur?.guide.title && <span className="text-zinc-400">· {cur.guide.title}</span>}
        <span className="ml-auto text-xs text-zinc-500">OK · options</span>
      </div>

      {error && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg bg-red-950/90 px-4 py-2 text-red-200">
          {error}
        </div>
      )}

      {/* Parity controls — audio / subtitles / quality */}
      {controlsOpen && (
        <div
          className="absolute inset-x-0 bottom-0 flex gap-10 px-10 pb-10 pt-16"
          style={{ background: "linear-gradient(to top, rgba(6,10,20,0.96), transparent)" }}
        >
          {cols.map((col, ci) => (
            <div key={col.key} className="min-w-[220px]">
              <div className="mb-3 text-sm uppercase tracking-wide text-zinc-500">{col.title}</div>
              <div className="flex flex-col gap-2">
                {col.items.map((it, ri) => {
                  const focused = ci === cfocus.col && ri === cfocus.row;
                  return (
                    <button
                      key={ri}
                      onClick={it.onSelect}
                      onMouseEnter={() => setCfocus({ col: ci, row: ri })}
                      className="flex items-center gap-3 rounded-lg px-4 py-3 text-left text-lg transition"
                      style={{
                        background: focused ? "rgba(59,130,246,0.15)" : "transparent",
                        boxShadow: focused ? "inset 0 0 0 2px #3b82f6" : "none",
                        color: it.selected ? "#f1f5f9" : "#94a3b8",
                      }}
                    >
                      <span style={{ width: 16, color: "#3b82f6" }}>{it.selected ? "●" : ""}</span>
                      {it.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="ml-auto self-end text-xs text-zinc-600">◄►/▲▼ move · OK select · Back close</div>
        </div>
      )}

      {/* Debug overlay */}
      {debug && (
        <div className="absolute bottom-5 left-5 max-w-xl rounded-lg bg-black/85 px-4 py-3 font-mono text-sm text-zinc-200">
          <div className={`text-base font-bold ${decoding ? "text-green-400" : "text-red-400"}`}>
            {decoding ? `▶ DECODING ${vstat!.w}×${vstat!.h}` : "✖ NOT DECODING (0×0)"}
            {vstat ? (vstat.paused ? " · paused" : decoding ? " · playing" : "") : ""}
          </div>
          {media && (
            <div className="mt-1 text-zinc-400">
              source: {media.container ?? "?"} {media.videoCodec ?? "?"}/{media.audioCodec ?? "?"} · mode{" "}
              <span className={media.mode !== "hls" ? "text-green-400" : "text-amber-400"}>{media.mode}</span> · caps{" "}
              <span className={media.capsSource === "measured" ? "text-green-400" : "text-amber-400"}>{media.capsSource ?? "?"}</span>
            </div>
          )}
          {media?.decision ? (
            <div>
              plex: video <span className="text-amber-400">{media.decision.videoDecision ?? "?"}</span>→
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
        </div>
      )}
      <button className="absolute bottom-2 right-2 text-xs text-zinc-700" onClick={() => setDebug((d) => !d)}>
        {debug ? "hide debug" : "debug"}
      </button>
    </div>
  );
}
