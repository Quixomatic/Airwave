import { AnimatePresence, motion } from "framer-motion";
import Hls from "hls.js";
import { Tv } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { FeaturePanel, type Progress } from "./feature-panel";
import { ApiError, api, type GuideChannel, type MediaInfo, type NowNext } from "../../lib/api";
import { clientCaps, deviceId } from "../../lib/device";

// Genre-ish accent palette (keyed by channel number) — matches the guide grid.
const ACCENTS = ["#2f9e8f", "#4a9fe0", "#3b82f6", "#8b5cf6", "#3fa66a", "#d08b2f", "#d0587e", "#7c8aa3"];

/**
 * The channel player. NOTHING is drawn on the live video (OLED burn-in) — press OK to
 * slide up the FeaturePanel (details + DVR controls + audio/subtitle/quality). Playback
 * is native-first (direct/http) with an hls.js runtime fallback. The DVR controls are
 * native seeks for now; the full effectiveTime/delaySeconds machine (cross-program
 * rewind, rollover-into-bumper, resume) is the next arc.
 */
type Options = { quality: string; audioLang?: string; subtitleLang?: string };

export function Watch({
  channelId,
  channel,
  onExit,
}: {
  channelId: string;
  channel?: GuideChannel;
  onExit: () => void;
}) {
  const channelName = channel ? `${channel.number} · ${channel.name}` : "";
  const accent = channel ? ACCENTS[channel.number % ACCENTS.length]! : "#3b82f6";
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const sessionRef = useRef<string | null>(null);
  const curRef = useRef<NowNext["current"]>(null);
  const mediaRef = useRef<MediaInfo | null>(null);
  const loggedRef = useRef(false);
  const logTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retriedRef = useRef(false);
  // Program timing for the DVR scrubber. `baselineRef` captures the (currentTime, program
  // offset) pair at the first `playing` event, so program position = offset + (currentTime
  // − baselineCT) across all modes (direct / http / hls). This is the seed of the
  // effectiveTime machine.
  const progRef = useRef<{ startsAtMs: number; durationSeconds: number; tuneOffset: number } | null>(null);
  const baselineRef = useRef<{ ct: number; offset: number } | null>(null);

  const [now, setNow] = useState<NowNext | null>(null);
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBumper, setIsBumper] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const [quality, setQuality] = useState("original");
  const [audioLang, setAudioLang] = useState<string | undefined>(undefined);
  const [subtitleLang, setSubtitleLang] = useState<string | undefined>(undefined);
  const optionsRef = useRef<Options>({ quality, audioLang, subtitleLang });
  useEffect(() => {
    optionsRef.current = { quality, audioLang, subtitleLang };
  }, [quality, audioLang, subtitleLang]);

  const isBumperRef = useRef(false);
  useEffect(() => {
    isBumperRef.current = isBumper;
  }, [isBumper]);

  const [qualities, setQualities] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    api.qualities().then((r) => setQualities(r.qualities)).catch(() => {});
  }, []);

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
      video.src = m.url;
      void video.play().catch(() => {});
    } else {
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
        if (!cur) return;
        if (cur.kind === "BUMPER" || !cur.ratingKey) {
          teardown();
          setMedia(null);
          setIsBumper(true);
          curRef.current = cur;
          const remainingMs = Math.max(1000, (cur.durationSeconds - cur.offsetSeconds) * 1000);
          window.setTimeout(() => void resolve(), remainingMs);
          return;
        }
        setIsBumper(false);
        progRef.current = {
          startsAtMs: new Date(cur.startsAt).getTime(),
          durationSeconds: cur.durationSeconds,
          tuneOffset: cur.offsetSeconds,
        };
        baselineRef.current = null;
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

  // Watch-session heartbeat (Now Watching + transcode reaping); end on leaving.
  const heartbeat = useCallback(() => {
    const cur = curRef.current;
    const state = isBumperRef.current ? "bumper" : cur ? "program" : "off";
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
  useEffect(() => {
    return () => {
      void api.endSession().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (error) logResult(error);
  }, [error, logResult]);

  // DVR — program position derived from the baseline (progRef/baselineRef).
  const curPos = () => {
    const p = progRef.current;
    const v = videoRef.current;
    const b = baselineRef.current;
    if (!p) return 0;
    return b && v ? b.offset + (v.currentTime - b.ct) : p.tuneOffset;
  };
  const liveNow = () => {
    const p = progRef.current;
    return p ? Math.min(p.durationSeconds, (Date.now() - p.startsAtMs) / 1000) : 0;
  };
  const seekTo = (P: number) => {
    const v = videoRef.current;
    const b = baselineRef.current;
    if (!v || !b) return;
    const clamped = Math.max(0, Math.min(liveNow(), P)); // never seek past live
    v.currentTime = b.ct + (clamped - b.offset);
  };
  const onPlayPause = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };
  const onSeekBack = () => seekTo(curPos() - 10);
  const onSeekForward = () => seekTo(curPos() + 10);
  const onLive = () => {
    if (mediaRef.current?.mode === "direct" && baselineRef.current) seekTo(liveNow());
    else void resolve();
  };
  const onRestart = () => {
    const v = videoRef.current;
    if (mediaRef.current?.mode === "direct" && v) {
      v.currentTime = 0;
      void v.play().catch(() => {});
      return;
    }
    const cur = curRef.current;
    if (!cur?.ratingKey) return;
    const o = optionsRef.current;
    void api
      .media(channelId, cur.ratingKey, 0, {
        caps: clientCaps(),
        deviceId: deviceId(),
        quality: o.quality,
        audioLang: o.audioLang,
        subtitleLang: o.subtitleLang,
      })
      .then((m) => {
        teardown();
        sessionRef.current = m.session;
        setMedia(m);
        mediaRef.current = m;
        play(m, 0);
      })
      .catch(() => {});
  };

  const selectAudio = (lang: string) => {
    optionsRef.current.audioLang = lang;
    setAudioLang(lang);
    void resolve();
  };
  const selectSub = (lang: string) => {
    optionsRef.current.subtitleLang = lang;
    setSubtitleLang(lang);
    void resolve();
  };
  const selectQuality = (id: string) => {
    optionsRef.current.quality = id;
    setQuality(id);
    void resolve();
  };

  // Sample program position for the scrubber — only while the panel is open (no work,
  // and nothing on screen, during normal viewing).
  const [progress, setProgress] = useState<Progress>({ position: 0, duration: 0, liveOffset: 0, paused: false });
  useEffect(() => {
    if (!panelOpen) return;
    const sample = () => {
      const p = progRef.current;
      const v = videoRef.current;
      const b = baselineRef.current;
      if (!p) return;
      const pos = b && v ? b.offset + (v.currentTime - b.ct) : p.tuneOffset;
      setProgress({
        position: Math.max(0, pos),
        duration: p.durationSeconds,
        liveOffset: Math.max(0, Math.min(p.durationSeconds, (Date.now() - p.startsAtMs) / 1000)),
        paused: v?.paused ?? false,
      });
    };
    sample();
    const id = window.setInterval(sample, 500);
    return () => window.clearInterval(id);
  }, [panelOpen]);

  // Remote: panel closed → OK/Up opens it, Back exits. When open, the FeaturePanel
  // owns the keys (this handler yields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (panelOpen) return;
      const isBack =
        e.keyCode === 461 || ["Backspace", "GoBack", "BrowserBack", "XF86Back"].includes(e.key);
      if (isBack) {
        e.preventDefault();
        e.stopPropagation();
        teardown();
        onExit();
      } else if (e.key === "Enter" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setPanelOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [panelOpen, teardown, onExit]);

  const cur = now?.current;

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        onPlaying={() => {
          // Capture the position baseline once per tune (see progRef/baselineRef).
          if (!baselineRef.current && progRef.current && videoRef.current) {
            baselineRef.current = { ct: videoRef.current.currentTime, offset: progRef.current.tuneOffset };
          }
        }}
        onEnded={() => void resolve()}
        onError={() => {
          const e = videoRef.current?.error;
          if (mediaRef.current && mediaRef.current.mode !== "hls" && !retriedRef.current) {
            retriedRef.current = true;
            void resolve(true);
            return;
          }
          if (e) setError(`Video error ${e.code}: ${e.message || "decode/playback failed"}`);
        }}
      />

      {/* Bumper interstitial (transient — the designed "we'll be right back" card). */}
      {isBumper && cur && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
          <p className="text-2xl text-zinc-400">We'll be right back…</p>
          {cur.guide.title && <p className="text-4xl font-semibold">Up next: {cur.guide.title}</p>}
        </div>
      )}

      {error && !panelOpen && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-lg bg-red-950/90 px-4 py-2 text-red-200">
          {error}
        </div>
      )}

      {/* Glass channel chip, top-right — only while the panel is up. */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            key="chip"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: 28,
              right: 40,
              display: "flex",
              alignItems: "center",
              gap: 12,
              height: 56,
              padding: "0 22px 0 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(18,24,38,0.55)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            <span style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `${accent}33`, color: accent }}>
              <Tv size={20} />
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: accent }}>{channel?.number}</span>
            <span style={{ fontSize: 22, fontWeight: 600, color: "#e6eaf1" }}>{channel?.name}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panelOpen && (
          <FeaturePanel
            key="panel"
            cur={cur ?? null}
            accent={accent}
            media={media}
            qualities={qualities}
            quality={quality}
            audioLang={audioLang}
            subtitleLang={subtitleLang}
            progress={progress}
            onSeekBack={onSeekBack}
            onSeekForward={onSeekForward}
            onPlayPause={onPlayPause}
            onLive={onLive}
            onRestart={onRestart}
            onChannelSurf={() => {
              teardown();
              onExit();
            }}
            onSelectAudio={selectAudio}
            onSelectSub={selectSub}
            onSelectQuality={selectQuality}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
