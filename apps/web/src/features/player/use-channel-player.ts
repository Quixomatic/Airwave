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
  error: string | null;
};

const LIVE_THRESHOLD = 5; // within this many seconds of live counts as "live"
const HEARTBEAT_MS = 10_000;

function titleOf(g?: SlotGuide | null): string {
  if (!g) return "";
  return g.showTitle ? `${g.showTitle} — ${g.title}` : g.title;
}

type Current = {
  index: number;
  kind: "PROGRAM" | "BUMPER";
  startS: number;
  endS: number;
  ratingKey: string | null;
  guide: SlotGuide;
  mode?: "direct" | "hls";
  session?: string | null;
  /** Media-time (seconds) we asked playback to start at. */
  playStartOffset: number;
  /** video.currentTime captured at the first `playing` event (HLS may start it at the
   *  original media position, not 0 — so we measure progress as a delta from this). */
  playStartCurrentTime: number;
  /** True once the baseline above has been captured from a real `playing` event. */
  baselineReady: boolean;
};

export function useChannelPlayer(channelId: string) {
  const videoRef = useRef<HTMLVideoElement>(null);
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

      // No-op if we're already playing this exact program at ~this position — avoids a
      // redundant reload that would needlessly restart (and could kill) the transcode.
      const cur = currentRef.current;
      if (entry.slot.kind !== "BUMPER" && entry.slot.ratingKey && cur?.kind === "PROGRAM") {
        const curEff = cur.baselineReady
          ? cur.startS +
            cur.playStartOffset +
            ((videoRef.current?.currentTime ?? cur.playStartCurrentTime) - cur.playStartCurrentTime)
          : cur.startS + cur.playStartOffset;
        if (cur.index === slots.indexOf(entry) && Math.abs(clamped - curEff) < 2) return;
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
        playStartOffset: offset,
        playStartCurrentTime: 0,
        baselineReady: false,
      };
      pausedRef.current = false;

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
        durationSlot: Math.round(entry.endS - entry.startS),
      });

      if (info.mode === "hls" && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hlsRef.current = hls;
        hls.loadSource(info.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}));
      } else if (info.mode === "hls") {
        // Native HLS (Safari) — offset already baked into the URL.
        video.src = info.url;
        video.addEventListener("loadedmetadata", () => void video.play().catch(() => {}), {
          once: true,
        });
      } else {
        video.src = info.url;
        video.addEventListener(
          "loadedmetadata",
          () => {
            if (offset > 0) video.currentTime = offset;
            void video.play().catch(() => {});
          },
          { once: true },
        );
      }
      } finally {
        transitioningRef.current = false;
      }
    },
    [channelId, now, stopMedia, stopSession],
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
      const nextSlot = slotsRef.current[cur.index + 1]?.slot;
      setStatus((s) => {
        const next: PlayerStatus = {
          ...s,
          loading: false,
          state: cur.kind === "BUMPER" ? "bumper" : "program",
          title: titleOf(cur.guide),
          subtitle: cur.guide.contentRating ?? null,
          summary: cur.guide.summary ?? null,
          nextTitle: nextSlot ? titleOf(nextSlot.guide) : null,
          delaySeconds: Math.round(delay),
          isLive: delay < LIVE_THRESHOLD,
          bumperRemaining: cur.kind === "BUMPER" ? Math.max(0, Math.ceil(cur.endS - effective)) : null,
          paused: pausedRef.current,
        };
        return next;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [now, goTo, currentEffective]);

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
      void goTo(now());
    }
  }, [timeline.data, goTo, now]);

  // Full teardown on unmount so a remount cleanly re-bootstraps.
  useEffect(() => {
    return () => {
      stopMedia();
      currentRef.current = null;
    };
  }, [stopMedia]);

  // ── Heartbeat the session; end it (and stop the transcode) on teardown ──
  useEffect(() => {
    const beat = () => {
      const cur = currentRef.current;
      void trpcClient.playback.heartbeat
        .mutate({
          channelId,
          state: cur ? (cur.kind === "BUMPER" ? "bumper" : "program") : "off",
          ratingKey: cur?.ratingKey ?? null,
          title: cur ? titleOf(cur.guide) : null,
          delaySeconds: Math.max(0, Math.round(now() - currentEffective())),
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
      togglePause: () => {
        const cur = currentRef.current;
        if (cur?.kind === "PROGRAM") {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) void video.play().catch(() => {});
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
    [goTo, now, currentEffective],
  );

  return {
    videoRef,
    status,
    controls,
    loadingTimeline: timeline.isLoading,
    timelineError: timeline.error instanceof Error ? timeline.error.message : null,
  };
}
