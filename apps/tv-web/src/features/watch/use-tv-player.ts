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

/** A slot rendered on the scrubber, already mapped to bar percentages. */
export type ScrubberSegment = {
  kind: "PROGRAM" | "BUMPER";
  leftPct: number;
  widthPct: number;
  current: boolean; // the focus (expanded) program
  fillPct: number; // accent fill (0–100 within this segment) up to the thumb
};
export type ScrubberView = {
  segments: ScrubberSegment[];
  thumbPct: number;
  livePct: number;
  liveVisible: boolean;
  slotPositionS: number; // position within the slot you're in
  atLive: boolean;
  behindS: number; // now − effectiveTime
};

export type PlayerStatus = {
  loading: boolean;
  /** The <video> is waiting on data (initial load or a mid-stream rebuffer) — show a spinner. */
  buffering: boolean;
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

export type PlayerOptions = { quality?: string; audioStreamId?: string; subtitleStreamId?: string };
export type PlayerTrack = { id: string; lang: string; label: string };

const LIVE_THRESHOLD = 5;
const HEARTBEAT_MS = 10_000;
// Scrubber layout: the program you're in is the EXPANDED middle; a fixed sliver of the
// timeline before it (prev-program tail + bumper) sits on the left, and a sliver of what's
// coming (bumper + next-program head) on the right — so at live the thumb never collides
// with the LIVE edge, and scrubbing moves the thumb through the wide middle (real motion).
const PEEK_L = 0.14; // left peek fraction of the bar
const PEEK_R = 0.14; // right peek fraction of the bar
const LOOKBACK_S = 6 * 60; // seconds of timeline compressed into the left peek
const LOOKAHEAD_S = 6 * 60; // seconds compressed into the right peek
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
  const paramsKey = `${options.quality ?? ""}|${options.audioStreamId ?? ""}|${options.subtitleStreamId ?? ""}`;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const paramsKeyRef = useRef(paramsKey);
  paramsKeyRef.current = paramsKey;

  const [tracks, setTracks] = useState<{ audio: PlayerTrack[]; subtitle: PlayerTrack[] }>({ audio: [], subtitle: [] });
  const [status, setStatus] = useState<PlayerStatus>({
    loading: true,
    buffering: false,
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
  // Diagnostics: the context of the last program load, so we can record its real on-device
  // outcome to PlaybackLog (~6s after load, and immediately on a <video> error).
  const logCtxRef = useRef<{
    deviceId: string;
    channelId: string;
    ratingKey: string | null;
    title: string;
    mode: string;
    sourceContainer: string | null;
    sourceVideoCodec: string | null;
    sourceAudioCodec: string | null;
    decision: MediaInfo["decision"] | null;
    caps: unknown;
  } | null>(null);

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

  // Post one PlaybackLog row for the last-loaded program: what Plex decided + whether the
  // panel actually decoded it. `outcome` forced to "error" from the <video> error handler.
  const recordLog = useCallback((outcome?: "error") => {
    const ctx = logCtxRef.current;
    if (!ctx) return;
    const v = videoRef.current;
    const decoded = (v?.videoWidth ?? 0) > 0;
    void api
      .logPlayback({
        ...ctx,
        outcome: outcome ?? (v?.error ? "error" : decoded ? "playing" : "not_decoding"),
        decodedWidth: v?.videoWidth ?? 0,
        decodedHeight: v?.videoHeight ?? 0,
        readyState: v?.readyState ?? 0,
        error: v?.error ? `code ${v.error.code}` : null,
      })
      .catch(() => {});
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
        setStatus((s) => ({ ...s, loading: true, error: null, buffering: true }));
        let info: MediaInfo;
        try {
          info = await api.media(channelId, entry.slot.ratingKey, offset, {
            caps: clientCaps(),
            deviceId: deviceId(),
            forceHls,
            quality: optionsRef.current.quality,
            audioStreamId: optionsRef.current.audioStreamId,
            subtitleStreamId: optionsRef.current.subtitleStreamId,
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

        // Capture this load for PlaybackLog, then record the real outcome ~6s later (unless a
        // newer load supersedes it). A <video> error records immediately (error handler below).
        logCtxRef.current = {
          deviceId: deviceId(),
          channelId,
          ratingKey: entry.slot.ratingKey,
          title: titleOf(entry.slot.guide),
          mode: info.mode,
          sourceContainer: info.container ?? null,
          sourceVideoCodec: info.videoCodec ?? null,
          sourceAudioCodec: info.audioCodec ?? null,
          decision: info.decision ?? null,
          caps: { capsSource: info.capsSource },
        };
        window.setTimeout(() => {
          if (gen === genRef.current) recordLog();
        }, 6000);
      } finally {
        transitioningRef.current = false;
      }
    },
    [channelId, now, stopMedia, stopSession, tryPlay, recordLog],
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

  // Build the scrubber view — the PROGRAM you're in is the expanded middle, flanked by a
  // fixed left peek (prev tail + bumper) and right peek (upcoming bumper + next head).
  const buildScrubber = useCallback(
    (effective: number, nowS: number): ScrubberView => {
      const slots = slotsRef.current;
      const behindS = Math.max(0, nowS - effective);
      const atLive = behindS < LIVE_THRESHOLD;
      const curIdx = slots.findIndex((s) => effective >= s.startS && effective < s.endS);
      const cur = curIdx >= 0 ? slots[curIdx]! : null;
      if (!cur) {
        return { segments: [], thumbPct: 0, livePct: 100, liveVisible: false, slotPositionS: 0, atLive, behindS };
      }

      // Focus = the program you're in; if you're in a bumper, the nearest program (prev, else next).
      let focus = cur;
      if (cur.slot.kind === "BUMPER") {
        let j = curIdx - 1;
        while (j >= 0 && slots[j]!.slot.kind !== "PROGRAM") j--;
        if (j >= 0) focus = slots[j]!;
        else {
          let k = curIdx + 1;
          while (k < slots.length && slots[k]!.slot.kind !== "PROGRAM") k++;
          if (k < slots.length) focus = slots[k]!;
        }
      }
      const fStart = focus.startS;
      const fEnd = focus.endS;
      const fDur = Math.max(1, fEnd - fStart);
      const peekStart = fStart - LOOKBACK_S;
      const peekEnd = fEnd + LOOKAHEAD_S;

      const mapT = (t: number): number => {
        let f: number;
        if (t < fStart) f = PEEK_L * (1 - Math.min(1, (fStart - t) / LOOKBACK_S));
        else if (t > fEnd) f = 1 - PEEK_R + Math.min(1, (t - fEnd) / LOOKAHEAD_S) * PEEK_R;
        else f = PEEK_L + ((t - fStart) / fDur) * (1 - PEEK_L - PEEK_R);
        return Math.min(100, Math.max(0, f * 100));
      };

      const thumbPct = mapT(effective);
      const liveVisible = nowS >= peekStart && nowS <= peekEnd;
      const livePct = liveVisible ? mapT(nowS) : 100;

      const segments: ScrubberSegment[] = [];
      for (const s of slots) {
        if (s.endS <= peekStart || s.startS >= peekEnd) continue;
        const l = mapT(Math.max(s.startS, peekStart));
        const r = mapT(Math.min(s.endS, peekEnd));
        const widthPct = Math.max(0, r - l);
        if (widthPct <= 0.05) continue;
        const isFocus = s === focus;
        const fillPct = isFocus && thumbPct > l ? Math.min(100, ((thumbPct - l) / Math.max(0.0001, widthPct)) * 100) : 0;
        segments.push({ kind: s.slot.kind, leftPct: l, widthPct, current: isFocus, fillPct });
      }
      return { segments, thumbPct, livePct, liveVisible, slotPositionS: effective - cur.startS, atLive, behindS };
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
      recordLog("error");
      const cur = currentRef.current;
      if (cur?.kind === "PROGRAM" && cur.mode !== "hls" && !cur.retried) {
        void goTo(currentEffective(), true); // retry this spot forcing hls.js
      }
    };
    // Buffering feedback: waiting/stalled → spinner on; playing/canplay → off.
    const onWaiting = () => setStatus((s) => (s.buffering ? s : { ...s, buffering: true }));
    const onResume = () => setStatus((s) => (s.buffering ? { ...s, buffering: false } : s));
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onWaiting);
    video.addEventListener("playing", onResume);
    video.addEventListener("canplay", onResume);
    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onWaiting);
      video.removeEventListener("playing", onResume);
      video.removeEventListener("canplay", onResume);
    };
  }, [goTo, currentEffective, recordLog]);

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
