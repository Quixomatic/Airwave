import { useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { trpc, trpcClient } from "@/utils/trpc";

/**
 * The channel-player state machine from `.docs/playback-model.md`. Drives a <video>
 * off a single clock (effectiveTime); `delaySeconds = now − effectiveTime`. Derives the
 * current slot + offset from actual playback position, auto-rolls at boundaries
 * (program → bumper card → next program), and never seeks past live. Sends heartbeats
 * to the in-house session tracker and stops Plex transcodes on teardown.
 */

type SlotGuide = { title: string; showTitle?: string; contentRating?: string; summary?: string };
type Slot = {
  id: string;
  kind: "PROGRAM" | "BUMPER";
  ratingKey: string | null;
  startsAt: string;
  durationSeconds: number;
  guide: SlotGuide;
};
type SlotEntry = { slot: Slot; startS: number; endS: number };

export type PlayerStatus = {
  loading: boolean;
  state: "program" | "bumper" | "off" | "idle";
  title: string;
  subtitle: string | null;
  summary: string | null;
  nextTitle: string | null;
  delaySeconds: number;
  isLive: boolean;
  bumperRemaining: number | null;
  paused: boolean;
  /** Autoplay was blocked (no user gesture) — the UI should show a click-to-play prompt. */
  blocked: boolean;
  error: string | null;
};

const LIVE_THRESHOLD = 5; // within this many seconds of live counts as "live"
const HEARTBEAT_MS = 10_000;
/** Client-local resume position (survives reload; reset when you switch channels). */
const RESUME_KEY = "cg-resume";
/** Walk away longer than this and a reload just goes live again. */
const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function titleOf(g?: SlotGuide | null): string {
  if (!g) return "";
  return g.showTitle ? `${g.showTitle} — ${g.title}` : g.title;
}

/**
 * The saved resume position (seconds) for `channelId`, or `liveNow` if none is valid.
 * Requires: same channel, behind live, recent (< RESUME_MAX_AGE_MS — walk away and it's
 * live), and still within the retained schedule window ([earliestStartS, liveNow]).
 */
function resumePosition(channelId: string, earliestStartS: number, liveNow: number): number {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return liveNow;
    const r = JSON.parse(raw) as {
      channelId?: string;
      positionAt?: number;
      atLiveEdge?: boolean;
      savedAt?: number;
    };
    const posSec = (r.positionAt ?? 0) / 1000;
    const fresh = Date.now() - (r.savedAt ?? 0) < RESUME_MAX_AGE_MS;
    if (r.channelId === channelId && !r.atLiveEdge && fresh && posSec >= earliestStartS && posSec < liveNow) {
      return posSec;
    }
  } catch {
    // malformed / unavailable storage — fall through to live
  }
  return liveNow;
}

type Current = {
  index: number;
  kind: "PROGRAM" | "BUMPER";
  startS: number;
  endS: number;
  ratingKey: string | null;
  guide: SlotGuide;
  // "http" (progressive native transcode) only occurs for the TV client; the admin
  // preview passes no caps so it always resolves to direct/hls — kept in the union so
  // the shared PlaybackInfo type assigns cleanly.
  mode?: "direct" | "http" | "hls";
  session?: string | null;
  /** The stream-params key this was resolved at (quality/audio/subs) — a change re-resolves. */
  paramsKey?: string;
  /** Media-time (seconds) we asked playback to start at. */
  playStartOffset: number;
  /** video.currentTime captured at the first `playing` event (HLS may start it at the
   *  original media position, not 0 — so we measure progress as a delta from this). */
  playStartCurrentTime: number;
  /** True once the baseline above has been captured from a real `playing` event. */
  baselineReady: boolean;
};

export type PlayerOptions = { quality?: string; audioLang?: string; subtitleLang?: string };
export type PlayerTrack = { lang: string; label: string };

export function useChannelPlayer(channelId: string, options: PlayerOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // A single key over all stream params — a change to any re-resolves at the same spot.
  const paramsKey = `${options.quality ?? ""}|${options.audioLang ?? ""}|${options.subtitleLang ?? ""}`;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const paramsKeyRef = useRef(paramsKey);
  paramsKeyRef.current = paramsKey;
  const [tracks, setTracks] = useState<{ audio: PlayerTrack[]; subtitle: PlayerTrack[] }>({
    audio: [],
    subtitle: [],
  });
  const timeline = useQuery({
    ...trpc.playback.timeline.queryOptions({ channelId }),
    refetchInterval: 120_000,
  });

  const [status, setStatus] = useState<PlayerStatus>({
    loading: true,
    state: "idle",
    title: "",
    subtitle: null,
    summary: null,
    nextTitle: null,
    delaySeconds: 0,
    isLive: true,
    bumperRemaining: null,
    paused: false,
    blocked: false,
    error: null,
  });

  const clockOffsetRef = useRef(0); // ms: serverTime − clientTime
  const slotsRef = useRef<SlotEntry[]>([]);
  const hlsRef = useRef<Hls | null>(null);
  const genRef = useRef(0); // guards against stale async media loads
  const pausedRef = useRef(false);
  const bumperEffRef = useRef(0); // effectiveTime while in a bumper (no media to slave to)
  const lastTickRef = useRef(Date.now());
  const currentRef = useRef<Current | null>(null);
  const transitioningRef = useRef(false); // a goTo is mid-flight — don't start another

  const now = useCallback(() => (Date.now() + clockOffsetRef.current) / 1000, []);

  const stopMedia = useCallback(() => {
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.removeAttribute("src");
      video.load();
    }
  }, []);

  const stopSession = useCallback(
    (session?: string | null) => {
      if (session) void trpcClient.playback.stop.mutate({ channelId, session }).catch(() => {});
    },
    [channelId],
  );

  // Attempt playback; if the browser blocks autoplay (no user gesture — e.g. after a
  // reload), flag it so the UI can prompt a click. Clears the flag once playing.
  const tryPlay = useCallback((video: HTMLVideoElement) => {
    video
      .play()
      .then(() => setStatus((s) => (s.blocked ? { ...s, blocked: false } : s)))
      .catch(() => setStatus((s) => ({ ...s, blocked: true })));
  }, []);

  const goTo = useCallback(
    async (target: number) => {
      const slots = slotsRef.current;
      if (slots.length === 0) return;
      if (transitioningRef.current) return; // a transition is already in flight
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

      // No-op if we're already playing this exact program at ~this position AND the same
      // quality — avoids a redundant reload, but still re-resolves on a quality change.
      const cur = currentRef.current;
      if (entry.slot.kind !== "BUMPER" && entry.slot.ratingKey && cur?.kind === "PROGRAM") {
        const curEff = cur.baselineReady
          ? cur.startS +
            cur.playStartOffset +
            ((videoRef.current?.currentTime ?? cur.playStartCurrentTime) - cur.playStartCurrentTime)
          : cur.startS + cur.playStartOffset;
        if (
          cur.index === slots.indexOf(entry) &&
          Math.abs(clamped - curEff) < 2 &&
          cur.paramsKey === paramsKeyRef.current
        )
          return;
      }

      if (entry.slot.kind === "BUMPER" || !entry.slot.ratingKey) {
        genRef.current++;
        stopSession(prevSession);
        stopMedia();
        const index = slots.indexOf(entry);
        currentRef.current = {
          index,
          kind: "BUMPER",
          startS: entry.startS,
          endS: entry.endS,
          ratingKey: null,
          guide: entry.slot.guide,
          playStartOffset: 0,
          playStartCurrentTime: 0,
          baselineReady: true,
          session: null,
        };
        bumperEffRef.current = clamped;
        pausedRef.current = false;
        console.debug("[player] bumper", { until: Math.round(entry.endS) });
        return;
      }

      // PROGRAM — resolve a playable URL at the needed offset, then load it.
      const gen = ++genRef.current;
      const offset = Math.max(0, Math.floor(clamped - entry.startS));
      setStatus((s) => ({ ...s, loading: true, error: null }));
      let info: Awaited<ReturnType<typeof trpcClient.playback.media.query>>;
      try {
        info = await trpcClient.playback.media.query({
          channelId,
          ratingKey: entry.slot.ratingKey,
          offsetSeconds: offset,
          quality: optionsRef.current.quality,
          audioLang: optionsRef.current.audioLang,
          subtitleLang: optionsRef.current.subtitleLang,
        });
      } catch (err) {
        if (gen !== genRef.current) return;
        setStatus((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Playback failed",
        }));
        return;
      }
      if (gen !== genRef.current) return; // a newer goTo superseded us

      // Stop the *previous* transcode (never the one we just resolved).
      if (prevSession && prevSession !== info.session) stopSession(prevSession);
      stopMedia();
      const video = videoRef.current;
      if (!video) return;
      const index = slots.indexOf(entry);
      currentRef.current = {
        index,
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
      };
      pausedRef.current = false;
      setTracks({ audio: info.audioTracks, subtitle: info.subtitleTracks });

      // Capture the true start position from the first real `playing` event — HLS may
      // report currentTime starting at the media offset rather than 0.
      const loadedCur = currentRef.current;
      video.addEventListener(
        "playing",
        () => {
          if (currentRef.current === loadedCur) {
            loadedCur.playStartCurrentTime = video.currentTime;
            loadedCur.baselineReady = true;
            console.debug("[player] baseline", {
              offset,
              currentTime: Math.round(video.currentTime),
              mode: info.mode,
            });
          }
        },
        { once: true },
      );
      console.debug("[player] load", {
        offset,
        mode: info.mode,
        subtitleLang: optionsRef.current.subtitleLang,
        audioLang: optionsRef.current.audioLang,
        quality: optionsRef.current.quality,
        burn: info.url.includes("subtitles=burn"),
        subtitleStreamID: new URLSearchParams(info.url.split("?")[1] ?? "").get("subtitleStreamID"),
        durationSlot: Math.round(entry.endS - entry.startS),
      });

      if (info.mode === "hls" && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_e, data) => {
          console.warn("[player] hls error", {
            type: data.type,
            details: data.details,
            fatal: data.fatal,
            code: (data as { response?: { code?: number } }).response?.code,
            url: (data as { url?: string }).url,
          });
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
          // Fatal network error (e.g. Plex 400 on start.m3u8) — surface it instead of
          // sitting on a black frame.
          setStatus((s) => ({
            ...s,
            loading: false,
            error: `Stream error (${data.details}${
              (data as { response?: { code?: number } }).response?.code
                ? ` · ${(data as { response?: { code?: number } }).response!.code}`
                : ""
            })`,
          }));
        });
        hls.loadSource(info.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => tryPlay(video));
      } else if (info.mode === "hls") {
        // Native HLS (Safari) — offset already baked into the URL.
        video.src = info.url;
        video.addEventListener("loadedmetadata", () => tryPlay(video), { once: true });
      } else {
        video.src = info.url;
        video.addEventListener(
          "loadedmetadata",
          () => {
            if (offset > 0) video.currentTime = offset;
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

  /** Where we actually are on the timeline right now (seconds). */
  const currentEffective = useCallback((): number => {
    const cur = currentRef.current;
    if (!cur) return now();
    if (cur.kind === "PROGRAM") {
      // Until the baseline is captured, we're pinned at the requested offset.
      if (!cur.baselineReady) return cur.startS + cur.playStartOffset;
      const ct = videoRef.current?.currentTime ?? cur.playStartCurrentTime;
      return cur.startS + cur.playStartOffset + (ct - cur.playStartCurrentTime);
    }
    return bumperEffRef.current;
  }, [now]);

  // ── The single tick: derive effectiveTime, roll at boundaries, publish status ──
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
        // Roll over only when we've genuinely reached the scheduled end. Ignoring a
        // spurious early 'ended' (e.g. during HLS startup) avoids looping back to live.
        if (effective >= cur.endS - 0.25) {
          console.debug("[player] rollover", {
            effective: Math.round(effective),
            endS: Math.round(cur.endS),
          });
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

      // Persist the client's seek position so a reload resumes the exact spot. Keyed to
      // the current channel, so switching channels overwrites it (no stale resume).
      try {
        localStorage.setItem(
          RESUME_KEY,
          JSON.stringify({
            channelId,
            positionAt: Math.round(effective * 1000),
            atLiveEdge: delay < LIVE_THRESHOLD,
            savedAt: Date.now(),
          }),
        );
      } catch {
        // localStorage unavailable — resume just won't persist.
      }

      const nextSlot = slotsRef.current[cur.index + 1]?.slot;
      const state = cur.kind === "BUMPER" ? "bumper" : "program";
      const title = titleOf(cur.guide);
      const nextTitle = nextSlot ? titleOf(nextSlot.guide) : null;
      const delaySeconds = Math.round(delay);
      const isLive = delay < LIVE_THRESHOLD;
      const bumperRemaining =
        cur.kind === "BUMPER" ? Math.max(0, Math.ceil(cur.endS - effective)) : null;
      const paused = pausedRef.current;
      setStatus((s) => {
        // Bail out (return the same object) when nothing visible changed — React then
        // skips the re-render, so the 500ms tick doesn't thrash the main thread.
        if (
          !s.loading &&
          s.state === state &&
          s.title === title &&
          s.nextTitle === nextTitle &&
          s.delaySeconds === delaySeconds &&
          s.isLive === isLive &&
          s.bumperRemaining === bumperRemaining &&
          s.paused === paused
        ) {
          return s;
        }
        return {
          ...s,
          loading: false,
          state,
          title,
          subtitle: cur.guide.contentRating ?? null,
          summary: cur.guide.summary ?? null,
          nextTitle,
          delaySeconds,
          isLive,
          bumperRemaining,
          paused,
        };
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [now, goTo, currentEffective, channelId]);

  // ── Build slots from the timeline; start at live on first load ──
  useEffect(() => {
    if (!timeline.data) return;
    clockOffsetRef.current = new Date(timeline.data.serverTime).getTime() - Date.now();
    slotsRef.current = (timeline.data.slots as Slot[]).map((slot) => {
      const startS = new Date(slot.startsAt).getTime() / 1000;
      return { slot, startS, endS: startS + slot.durationSeconds };
    });
    // Bootstrap when nothing is playing (initial load, or after a remount that tore
    // down the previous session — e.g. StrictMode's double-invoke, or channel switch).
    if (currentRef.current === null && slotsRef.current.length > 0) {
      void goTo(resumePosition(channelId, slotsRef.current[0]!.startS, now()));
    }
  }, [timeline.data, goTo, now, channelId]);

  // Full teardown on unmount so a remount cleanly re-bootstraps.
  useEffect(() => {
    return () => {
      stopMedia();
      currentRef.current = null;
    };
  }, [stopMedia]);

  // Re-resolve the current program at the same position when a stream param changes
  // (quality / audio / subtitles). Bumpers pick up the new setting on the next program.
  useEffect(() => {
    if (currentRef.current?.kind === "PROGRAM") void goTo(currentEffective());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  // ── Heartbeat the session; end it (and stop the transcode) on teardown ──
  useEffect(() => {
    const beat = () => {
      const cur = currentRef.current;
      const eff = currentEffective();
      void trpcClient.playback.heartbeat
        .mutate({
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
      void trpcClient.playback.endSession.mutate().catch(() => {});
    };
  }, [channelId, now, currentEffective]);

  // Roll over immediately when a program's file ends.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onEnded = () => {
      const cur = currentRef.current;
      // Only treat 'ended' as a rollover if we're actually near the scheduled end —
      // a premature/spurious 'ended' shouldn't bounce us back to live.
      if (cur?.kind === "PROGRAM" && currentEffective() >= cur.endS - 2) void goTo(cur.endS);
    };
    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [goTo, currentEffective]);

  const controls = useMemo(
    () => ({
      /** Start/resume playback from a user gesture (also clears an autoplay block). */
      play: () => {
        const video = videoRef.current;
        if (video) tryPlay(video);
        pausedRef.current = false;
        setStatus((s) => ({ ...s, paused: false }));
      },
      togglePause: () => {
        const cur = currentRef.current;
        if (cur?.kind === "PROGRAM") {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) tryPlay(video);
          else video.pause();
          pausedRef.current = video.paused;
        } else {
          pausedRef.current = !pausedRef.current;
        }
        setStatus((s) => ({ ...s, paused: pausedRef.current }));
      },
      jumpToLive: () => void goTo(now()),
      rewind: (seconds: number) => void goTo(currentEffective() - seconds),
      restart: () => {
        const cur = currentRef.current;
        if (cur) void goTo(cur.startS);
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
    timelineError: timeline.error instanceof Error ? timeline.error.message : null,
  };
}
