import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type GuideMeta, type MediaInfo, type TimelineSlot } from "../../lib/api";
import { clientCaps, deviceId } from "../../lib/device";

/**
 * The TV channel-player state machine — a NET-NEW, REST + native-first sibling of the
 * admin's `use-channel-player.ts` (which is tRPC and stays untouched). It drives a
 * <video> off a single clock (`effectiveTime`) on the whole channel timeline: derive the
 * current slot + offset from real playback position, auto-roll at boundaries
 * (program → bumper card → next program), never seek past live, and — the point of this
 * rewrite — let you rewind OUT of the current program, through the bumper, into the
 * previous program (`goTo(anyTime)` maps it to `(ratingKey, offset)`). Emits a scrubber
 * view: full-current-program at live, a sliding multi-segment window once you rewind
 * before it. Native-first playback (direct → http → hls.js) + safety-catch preserved.
 */

type SlotEntry = { slot: TimelineSlot; startS: number; endS: number };

export type Segment = { kind: "PROGRAM" | "BUMPER"; startS: number; endS: number; title: string; current: boolean };
export type ScrubberView = {
  mode: "program" | "window";
  windowStart: number;
  windowEnd: number;
  positionS: number; // effectiveTime
  liveS: number; // now
  behindS: number; // now − effectiveTime
  atLive: boolean;
  slotPositionS: number; // position within the current slot
  slotDurationS: number; // current slot length
  segments: Segment[];
};

export type PlayerStatus = {
  loading: boolean;
  state: "program" | "bumper" | "off" | "idle";
  guide: GuideMeta | null;
  paused: boolean;
  bumperRemaining: number | null;
  canRestart: boolean;
  error: string | null;
  scrubber: ScrubberView | null;
};

type Current = {
  index: number;
  kind: "PROGRAM" | "BUMPER";
  startS: number;
  endS: number;
  ratingKey: string | null;
  guide: GuideMeta;
  mode?: MediaInfo["mode"];
  session?: string | null;
  paramsKey?: string;
  playStartOffset: number;
  playStartCurrentTime: number;
  baselineReady: boolean;
  retried: boolean; // native→hls safety-catch used for this load
};

export type PlayerOptions = { quality?: string; audioLang?: string; subtitleLang?: string };
export type PlayerTrack = { lang: string; label: string };

const LIVE_THRESHOLD = 5;
const HEARTBEAT_MS = 10_000;
const WINDOW_SPAN_S = 13 * 60; // sliding-window width when rewound before the current program
const WINDOW_LEAD_S = 90; // show a little ahead of the thumb
const RESUME_KEY = "cg-tv-resume";
const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const titleOf = (g?: GuideMeta | null): string =>
  !g ? "" : g.showTitle ? `${g.showTitle} — ${g.title}` : g.title;

function resumePosition(channelId: string, earliestStartS: number, liveNow: number): number {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return liveNow;
    const r = JSON.parse(raw) as { channelId?: string; positionAt?: number; atLiveEdge?: boolean; savedAt?: number };
    const posSec = (r.positionAt ?? 0) / 1000;
    const fresh = Date.now() - (r.savedAt ?? 0) < RESUME_MAX_AGE_MS;
    if (r.channelId === channelId && !r.atLiveEdge && fresh && posSec >= earliestStartS && posSec < liveNow) {
      return posSec;
    }
  } catch {
    /* ignore */
  }
  return liveNow;
}

export function useTvPlayer(channelId: string, options: PlayerOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const paramsKey = `${options.quality ?? ""}|${options.audioLang ?? ""}|${options.subtitleLang ?? ""}`;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const paramsKeyRef = useRef(paramsKey);
  paramsKeyRef.current = paramsKey;

  const [tracks, setTracks] = useState<{ audio: PlayerTrack[]; subtitle: PlayerTrack[] }>({ audio: [], subtitle: [] });
  const [status, setStatus] = useState<PlayerStatus>({
    loading: true,
    state: "idle",
    guide: null,
    paused: false,
    bumperRemaining: null,
    canRestart: false,
    error: null,
    scrubber: null,
  });

  const timeline = useQuery({
    queryKey: ["timeline", channelId],
    queryFn: () => api.timeline(channelId, 360, 180),
    refetchInterval: 120_000,
  });

  const clockOffsetRef = useRef(0);
  const slotsRef = useRef<SlotEntry[]>([]);
  const hlsRef = useRef<Hls | null>(null);
  const genRef = useRef(0);
  const pausedRef = useRef(false);
  const bumperEffRef = useRef(0);
  const lastTickRef = useRef(Date.now());
  const currentRef = useRef<Current | null>(null);
  const transitioningRef = useRef(false);

  const now = useCallback(() => (Date.now() + clockOffsetRef.current) / 1000, []);

  const stopMedia = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.removeAttribute("src");
      v.load();
    }
  }, []);

  const stopSession = useCallback(
    (session?: string | null) => {
      if (session) void api.stop(channelId, session).catch(() => {});
    },
    [channelId],
  );

  const tryPlay = useCallback((v: HTMLVideoElement) => {
    void v.play().catch(() => {});
  }, []);

  const goTo = useCallback(
    async (target: number, forceHls = false) => {
      const slots = slotsRef.current;
      if (slots.length === 0) return;
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      try {
        const minT = slots[0]!.startS;
        const clamped = Math.min(now(), Math.max(minT, target));
        const entry = slots.find((s) => clamped >= s.startS && clamped < s.endS);
        const prevSession = currentRef.current?.session;

        if (!entry) {
          genRef.current++;
          stopSession(prevSession);
          stopMedia();
          currentRef.current = null;
          setStatus((s) => ({ ...s, loading: false, state: "off" }));
          return;
        }

        // No-op if already playing this exact program at ~this position + same params
        // (skip the guard on a forced hls retry so it actually re-resolves).
        const cur = currentRef.current;
        if (!forceHls && entry.slot.kind === "PROGRAM" && entry.slot.ratingKey && cur?.kind === "PROGRAM") {
          const curEff = cur.baselineReady
            ? cur.startS + cur.playStartOffset + ((videoRef.current?.currentTime ?? cur.playStartCurrentTime) - cur.playStartCurrentTime)
            : cur.startS + cur.playStartOffset;
          if (cur.index === slots.indexOf(entry) && Math.abs(clamped - curEff) < 2 && cur.paramsKey === paramsKeyRef.current) return;
        }

        if (entry.slot.kind === "BUMPER" || !entry.slot.ratingKey) {
          genRef.current++;
          stopSession(prevSession);
          stopMedia();
          currentRef.current = {
            index: slots.indexOf(entry),
            kind: "BUMPER",
            startS: entry.startS,
            endS: entry.endS,
            ratingKey: null,
            guide: entry.slot.guide,
            playStartOffset: 0,
            playStartCurrentTime: 0,
            baselineReady: true,
            retried: false,
            session: null,
          };
          bumperEffRef.current = clamped;
          pausedRef.current = false;
          return;
        }

        const gen = ++genRef.current;
        const offset = Math.max(0, Math.floor(clamped - entry.startS));
        setStatus((s) => ({ ...s, loading: true, error: null }));
        let info: MediaInfo;
        try {
          info = await api.media(channelId, entry.slot.ratingKey, offset, {
            caps: clientCaps(),
            deviceId: deviceId(),
            forceHls,
            quality: optionsRef.current.quality,
            audioLang: optionsRef.current.audioLang,
            subtitleLang: optionsRef.current.subtitleLang,
          });
        } catch (err) {
          if (gen !== genRef.current) return;
          setStatus((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Playback failed" }));
          return;
        }
        if (gen !== genRef.current) return;

        if (prevSession && prevSession !== info.session) stopSession(prevSession);
        stopMedia();
        const video = videoRef.current;
        if (!video) return;
        currentRef.current = {
          index: slots.indexOf(entry),
          kind: "PROGRAM",
          startS: entry.startS,
          endS: entry.endS,
          ratingKey: entry.slot.ratingKey,
          guide: entry.slot.guide,
          mode: info.mode,
          session: info.session,
          paramsKey: paramsKeyRef.current,
          playStartOffset: offset,
          playStartCurrentTime: 0,
          baselineReady: false,
          retried: forceHls,
        };
        pausedRef.current = false;
        setTracks({ audio: info.audioTracks, subtitle: info.subtitleTracks });

        const loadedCur = currentRef.current;
        video.addEventListener(
          "playing",
          () => {
            if (currentRef.current === loadedCur) {
              loadedCur.playStartCurrentTime = video.currentTime;
              loadedCur.baselineReady = true;
            }
          },
          { once: true },
        );

        if (info.mode === "hls" && Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true });
          hlsRef.current = hls;
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              hls.recoverMediaError();
              return;
            }
            setStatus((s) => ({ ...s, loading: false, error: `Stream error (${data.details})` }));
          });
          hls.loadSource(info.url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => tryPlay(video));
        } else if (info.mode === "http") {
          // Progressive transcode — offset baked in server-side; play from 0.
          video.src = info.url;
          video.addEventListener("loadedmetadata", () => tryPlay(video), { once: true });
        } else {
          // direct (raw file) — seek to the offset; also native HLS (Safari) with offset baked.
          video.src = info.url;
          video.addEventListener(
            "loadedmetadata",
            () => {
              if (info.mode === "direct" && offset > 0) video.currentTime = offset;
              tryPlay(video);
            },
            { once: true },
          );
        }
      } finally {
        transitioningRef.current = false;
      }
    },
    [channelId, now, stopMedia, stopSession, tryPlay],
  );

  const currentEffective = useCallback((): number => {
    const cur = currentRef.current;
    if (!cur) return now();
    if (cur.kind === "PROGRAM") {
      if (!cur.baselineReady) return cur.startS + cur.playStartOffset;
      const ct = videoRef.current?.currentTime ?? cur.playStartCurrentTime;
      return cur.startS + cur.playStartOffset + (ct - cur.playStartCurrentTime);
    }
    return bumperEffRef.current;
  }, [now]);

  // Build the scrubber view: full current program at live, sliding window once rewound.
  const buildScrubber = useCallback(
    (effective: number, nowS: number): ScrubberView => {
      const slots = slotsRef.current;
      const curEntry = slots.find((s) => effective >= s.startS && effective < s.endS) ?? null;
      const liveEntry = slots.find((s) => nowS >= s.startS && nowS < s.endS) ?? null;
      const behindS = Math.max(0, nowS - effective);
      const atLive = behindS < LIVE_THRESHOLD;
      const slotStart = curEntry?.startS ?? effective;
      const slotEnd = curEntry?.endS ?? nowS;

      const inLiveProgram = !!curEntry && curEntry === liveEntry && curEntry.slot.kind === "PROGRAM";
      if (inLiveProgram && curEntry) {
        return {
          mode: "program",
          windowStart: curEntry.startS,
          windowEnd: curEntry.endS,
          positionS: effective,
          liveS: nowS,
          behindS,
          atLive,
          slotPositionS: effective - curEntry.startS,
          slotDurationS: curEntry.endS - curEntry.startS,
          segments: [{ kind: "PROGRAM", startS: curEntry.startS, endS: curEntry.endS, title: titleOf(curEntry.slot.guide), current: true }],
        };
      }

      // Sliding multi-segment window, panning with the thumb, trimming the right.
      const earliest = slots[0]?.startS ?? effective;
      let windowEnd = Math.min(nowS, effective + WINDOW_LEAD_S);
      let windowStart = Math.max(earliest, windowEnd - WINDOW_SPAN_S);
      windowEnd = Math.min(nowS, windowStart + WINDOW_SPAN_S);
      const segments: Segment[] = slots
        .filter((s) => s.endS > windowStart && s.startS < windowEnd)
        .map((s) => ({ kind: s.slot.kind, startS: s.startS, endS: s.endS, title: titleOf(s.slot.guide), current: s === curEntry }));
      return {
        mode: "window",
        windowStart,
        windowEnd,
        positionS: effective,
        liveS: nowS,
        behindS,
        atLive,
        slotPositionS: effective - slotStart,
        slotDurationS: slotEnd - slotStart,
        segments,
      };
    },
    [],
  );

  // ── The tick: derive effectiveTime, roll at boundaries, publish status ──
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = now();
      const wallDt = (Date.now() - lastTickRef.current) / 1000;
      lastTickRef.current = Date.now();
      const cur = currentRef.current;
      if (!cur) return;

      let effective: number;
      if (cur.kind === "PROGRAM") {
        effective = currentEffective();
        if (effective >= cur.endS - 0.25) {
          void goTo(cur.endS);
          return;
        }
      } else {
        if (!pausedRef.current) bumperEffRef.current += wallDt;
        effective = bumperEffRef.current;
        if (effective >= cur.endS) {
          void goTo(cur.endS);
          return;
        }
      }

      const delay = Math.max(0, t - effective);
      try {
        localStorage.setItem(
          RESUME_KEY,
          JSON.stringify({ channelId, positionAt: Math.round(effective * 1000), atLiveEdge: delay < LIVE_THRESHOLD, savedAt: Date.now() }),
        );
      } catch {
        /* ignore */
      }

      const state = cur.kind === "BUMPER" ? "bumper" : "program";
      const bumperRemaining = cur.kind === "BUMPER" ? Math.max(0, Math.ceil(cur.endS - effective)) : null;
      setStatus((s) => ({
        ...s,
        loading: false,
        state,
        guide: cur.guide,
        paused: pausedRef.current,
        bumperRemaining,
        canRestart: cur.kind === "PROGRAM",
        scrubber: buildScrubber(effective, t),
      }));
    }, 500);
    return () => window.clearInterval(id);
  }, [now, goTo, currentEffective, buildScrubber, channelId]);

  // Build slots from the timeline; bootstrap at resume/live on first load.
  useEffect(() => {
    if (!timeline.data) return;
    clockOffsetRef.current = new Date(timeline.data.serverTime).getTime() - Date.now();
    slotsRef.current = timeline.data.slots.map((slot) => {
      const startS = new Date(slot.startsAt).getTime() / 1000;
      return { slot, startS, endS: startS + slot.durationSeconds };
    });
    if (currentRef.current === null && slotsRef.current.length > 0) {
      void goTo(resumePosition(channelId, slotsRef.current[0]!.startS, now()));
    }
  }, [timeline.data, goTo, now, channelId]);

  useEffect(() => {
    return () => {
      stopMedia();
      currentRef.current = null;
    };
  }, [stopMedia]);

  // Re-resolve the current program at the same spot on a quality/audio/subtitle change.
  useEffect(() => {
    if (currentRef.current?.kind === "PROGRAM") void goTo(currentEffective());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  // Heartbeat the session; end it on teardown.
  useEffect(() => {
    const beat = () => {
      const cur = currentRef.current;
      const eff = currentEffective();
      void api
        .heartbeat({
          channelId,
          state: cur ? (cur.kind === "BUMPER" ? "bumper" : "program") : "off",
          ratingKey: cur?.ratingKey ?? null,
          title: cur ? titleOf(cur.guide) : null,
          delaySeconds: Math.max(0, Math.round(now() - eff)),
          positionAt: new Date(eff * 1000).toISOString(),
          transcodeSession: cur?.session ?? null,
        })
        .catch(() => {});
    };
    const id = window.setInterval(beat, HEARTBEAT_MS);
    beat();
    return () => {
      window.clearInterval(id);
      void api.endSession().catch(() => {});
    };
  }, [channelId, now, currentEffective]);

  // Roll over on a program's natural end; native-first safety-catch on a decode error.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => {
      const cur = currentRef.current;
      if (cur?.kind === "PROGRAM" && currentEffective() >= cur.endS - 2) void goTo(cur.endS);
    };
    const onError = () => {
      const cur = currentRef.current;
      if (cur?.kind === "PROGRAM" && cur.mode !== "hls" && !cur.retried) {
        void goTo(currentEffective(), true); // retry this spot forcing hls.js
      }
    };
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [goTo, currentEffective]);

  const controls = useMemo(
    () => ({
      togglePause: () => {
        const cur = currentRef.current;
        if (cur?.kind === "PROGRAM") {
          const v = videoRef.current;
          if (!v) return;
          if (v.paused) tryPlay(v);
          else v.pause();
          pausedRef.current = v.paused;
        } else {
          pausedRef.current = !pausedRef.current;
        }
        setStatus((s) => ({ ...s, paused: pausedRef.current }));
      },
      jumpToLive: () => void goTo(now()),
      seekBy: (seconds: number) => void goTo(currentEffective() + seconds),
      restart: () => {
        const cur = currentRef.current;
        if (!cur) return;
        // Restart the SLOT you're in; in a (live) bumper there's no aired program to
        // restart → just jump back to live (which may leave you sitting in the bumper).
        if (cur.kind === "BUMPER") void goTo(now());
        else void goTo(cur.startS);
      },
    }),
    [goTo, now, currentEffective, tryPlay],
  );

  return {
    videoRef,
    status,
    controls,
    tracks,
    loadingTimeline: timeline.isLoading,
  };
}
