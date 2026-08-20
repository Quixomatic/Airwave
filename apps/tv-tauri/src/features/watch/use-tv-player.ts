import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type GuideMeta, type MediaInfo, type Track, type TimelineSlot } from "../../lib/api";
import { deviceId } from "../../lib/device";
import { mpv, mpvEvents, type MpvLoaded } from "./mpv";

/**
 * The tv-tauri channel player — the effectiveTime clock + DVR ported from tv-native's `use-tv-player`,
 * driving the full-window **Rust mpv** surface (Tauri commands + `mpv:*` events) instead of an
 * `<MpvPlayerView>`. Derives the current slot + offset from the real playback position, rolls at
 * boundaries, and — the DVR — `goTo(anyTime)` rewinds out of the current program through the bumper
 * into the previous one. Emits a multi-segment scrubber view.
 *
 * Seams vs tv-native: `viewRef.current?.play/pause/seek` → `mpv.play/pause/seek`; `setSource` →
 * `mpv.load`; view events → `mpvEvents.*` listeners. The ambient bumper-music bed (a second audio
 * engine) is DEFERRED — bumpers use the proven pause-and-hold path (the program stays loaded, mpv
 * pauses, and rolling out resumes in place).
 */
type SlotEntry = { slot: TimelineSlot; startS: number; endS: number };
type Current = {
  index: number;
  kind: "PROGRAM" | "BUMPER";
  startS: number;
  endS: number;
  ratingKey: string | null;
  guide: GuideMeta;
  offset: number;
  playStartCurrentTime: number;
  baselineReady: boolean;
  session: string | null;
  mode?: MediaInfo["mode"];
  delivery?: Delivery;
};

export type Delivery = {
  mode: "direct" | "http" | "hls";
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  videoDecision: string | null;
  audioDecision: string | null;
  connection: "local" | "remote" | "relay" | null;
};

export type ScrubberSegment = { kind: "PROGRAM" | "BUMPER"; leftPct: number; widthPct: number; current: boolean; fillPct: number };
export type ScrubberView = { segments: ScrubberSegment[]; thumbPct: number; livePct: number; liveVisible: boolean; slotPositionS: number; atLive: boolean; behindS: number };

export type PlayerStatus = {
  loading: boolean;
  buffering: boolean;
  state: "program" | "bumper" | "off" | "idle";
  guide: GuideMeta | null;
  paused: boolean;
  bumperRemaining: number | null;
  bumperElapsed: number | null;
  bumperTotal: number | null;
  bumperKey: string | null;
  canRestart: boolean;
  error: string | null;
  scrubber: ScrubberView | null;
  delivery: Delivery | null;
};

const LIVE_THRESHOLD = 5;
const PEEK_L = 0.14;
const PEEK_R = 0.14;
const LOOKBACK_S = 6 * 60;
const LOOKAHEAD_S = 6 * 60;
// Resume-stall watchdog: after unpausing, if mpv produces NO progress for this long, the stream is
// dead (a paused Plex session got reaped) → re-establish at the same spot. Bounded by MAX_RETRIES.
const RESUME_STALL_MS = 5000;
const RESUME_MAX_RETRIES = 2;

const titleOf = (g?: GuideMeta | null) => (!g ? "" : g.showTitle ? `${g.showTitle} — ${g.title}` : g.title);

export type PlayerOptions = { quality?: string; audioStreamId?: string; subtitleStreamId?: string; audioMode?: string };

export function useTvPlayer(channelId: string | null, options: PlayerOptions = {}, scrubberActive = true) {
  const positionSecRef = useRef(0); // latest time-pos (seconds); the effectiveTime clock reads this
  const playingRef = useRef(false);
  const paramsKey = `${options.quality ?? ""}|${options.audioStreamId ?? ""}|${options.subtitleStreamId ?? ""}|${options.audioMode ?? ""}`;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const scrubberActiveRef = useRef(scrubberActive);
  scrubberActiveRef.current = scrubberActive;

  const timeline = useQuery({ queryKey: ["timeline", channelId], queryFn: () => api.timeline(channelId!, 360, 180), refetchInterval: 120_000, enabled: !!channelId });

  const clockOffset = useRef(0);
  const slotsRef = useRef<SlotEntry[]>([]);
  const currentRef = useRef<Current | null>(null);
  const bumperEffRef = useRef(0);
  const pausedRef = useRef(false);
  const lastTick = useRef(Date.now());
  const genRef = useRef(0);
  const transitioning = useRef(false);
  const decodedDimsRef = useRef({ w: 0, h: 0 });
  const logCtxRef = useRef<Record<string, unknown> | null>(null);
  const loadStartRef = useRef(0);
  const currentUrlRef = useRef<string | null>(null);
  const firstProgressRef = useRef(false);
  const stallTicksRef = useRef(0);
  const lastPosSampleRef = useRef(0);
  const baselineArmedRef = useRef(false);
  const bufferingRef = useRef(false);
  const loggedRef = useRef(false);
  const lastProgressAtRef = useRef(0);
  const resumeWatchRef = useRef(false);
  const resumeDeadlineRef = useRef(0);
  const resumeAttemptsRef = useRef(0);

  const [tracks, setTracks] = useState<{ audio: Track[]; subtitle: Track[] }>({ audio: [], subtitle: [] });
  const [status, setStatus] = useState<PlayerStatus>({ loading: true, buffering: false, state: "idle", guide: null, paused: false, bumperRemaining: null, bumperElapsed: null, bumperTotal: null, bumperKey: null, canRestart: false, error: null, scrubber: null, delivery: null });

  const now = useCallback(() => (Date.now() + clockOffset.current) / 1000, []);

  const recordLog = useCallback((outcome?: "playing" | "not_decoding" | "error", errorDetail?: string | null) => {
    const ctx = logCtxRef.current;
    if (!ctx) return;
    loggedRef.current = true;
    const dims = decodedDimsRef.current;
    const decoded = dims.w > 0 && dims.h > 0;
    const finalOutcome = outcome ?? (decoded ? "playing" : "not_decoding");
    const diag = errorDetail ?? (finalOutcome === "not_decoding" ? `stuck: firstFrame=${firstProgressRef.current} buffering=${bufferingRef.current}` : null);
    void api.logPlayback({ ...ctx, outcome: finalOutcome, decodedWidth: dims.w, decodedHeight: dims.h, error: diag }).catch(() => {});
  }, []);

  const currentEffective = useCallback((): number => {
    const cur = currentRef.current;
    if (!cur) return now();
    if (cur.kind === "PROGRAM") return cur.baselineReady ? cur.startS + cur.offset + (positionSecRef.current - cur.playStartCurrentTime) : cur.startS + cur.offset;
    return bumperEffRef.current;
  }, [now]);

  const goTo = useCallback(
    async (target: number) => {
      const slots = slotsRef.current;
      if (!channelId || slots.length === 0 || transitioning.current) return;
      transitioning.current = true;
      try {
        const clamped = Math.min(now(), Math.max(slots[0]!.startS, target));
        const entry = slots.find((s) => clamped >= s.startS && clamped < s.endS);
        if (!entry) {
          currentRef.current = null;
          void mpv.stop();
          setStatus((s) => ({ ...s, loading: false, state: "off" }));
          return;
        }
        if (entry.slot.kind === "BUMPER" || !entry.slot.ratingKey) {
          // Bumper: pause-and-hold — keep the current PROGRAM loaded (mpv `pause` is a persistent
          // property) and deliberately KEEP `currentUrlRef` on it, so rolling back out into the SAME
          // program resolves `sameMedia` → resume-in-place. (Ambient bumper music is deferred.)
          currentRef.current = { index: slots.indexOf(entry), kind: "BUMPER", startS: entry.startS, endS: entry.endS, ratingKey: null, guide: entry.slot.guide, offset: 0, playStartCurrentTime: 0, baselineReady: true, session: null };
          bumperEffRef.current = clamped;
          pausedRef.current = false;
          resumeWatchRef.current = false; // a bumper isn't a program stream — don't let the watchdog fire
          void mpv.pause();
          return;
        }
        setMode();
        const gen = ++genRef.current;
        const offset = Math.max(0, Math.floor(clamped - entry.startS));
        setStatus((s) => ({ ...s, loading: true, error: null, buffering: true }));
        let info: MediaInfo;
        try {
          info = await api.media(channelId, entry.slot.ratingKey, offset, { deviceId: deviceId(), quality: optionsRef.current.quality, audioStreamId: optionsRef.current.audioStreamId, subtitleStreamId: optionsRef.current.subtitleStreamId });
        } catch (err) {
          if (gen !== genRef.current) return;
          setStatus((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Playback failed" }));
          return;
        }
        if (gen !== genRef.current) return;
        const delivery: Delivery = {
          mode: info.mode,
          container: info.decision?.container ?? info.container ?? null,
          videoCodec: info.videoCodec ?? info.decision?.videoCodec ?? null,
          audioCodec: info.audioCodec ?? info.decision?.audioCodec ?? null,
          videoDecision: info.decision?.videoDecision ?? null,
          audioDecision: info.decision?.audioDecision ?? null,
          connection: info.connection ?? null,
        };
        const loaded: Current = { index: slots.indexOf(entry), kind: "PROGRAM", startS: entry.startS, endS: entry.endS, ratingKey: entry.slot.ratingKey, guide: entry.slot.guide, offset, playStartCurrentTime: 0, baselineReady: false, session: info.session, mode: info.mode, delivery };
        currentRef.current = loaded;
        pausedRef.current = false;
        setTracks({ audio: info.audioTracks, subtitle: info.subtitleTracks });
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
          connection: info.connection ?? null,
        };
        loadStartRef.current = Date.now();
        const sameMedia = info.url === currentUrlRef.current;
        currentUrlRef.current = info.url;
        if (sameMedia) {
          // Already the loaded file/stream — a DVR seek within it (or rolling out of a bumper into the
          // program we paused). Resume in place: seek (still paused) then one play().
          positionSecRef.current = offset;
          if (info.mode === "direct") {
            loaded.playStartCurrentTime = offset;
            loaded.baselineReady = true;
            void mpv.seek(offset);
          } else {
            baselineArmedRef.current = true; // transcode URL already positioned; anchor off next progress
          }
          void mpv.play();
        } else {
          decodedDimsRef.current = { w: 0, h: 0 };
          positionSecRef.current = 0;
          firstProgressRef.current = false;
          baselineArmedRef.current = false; // anchor only after THIS source's mpv:loaded (barrier)
          bufferingRef.current = false;
          loggedRef.current = false;
          // A raw file opens AT the offset (mpv start=); a transcode URL already encodes it → open at 0.
          void mpv.load(info.url, info.mode === "direct" ? offset : 0);
          if (!pausedRef.current) void mpv.play();
          setTimeout(() => {
            if (gen === genRef.current && !loggedRef.current) recordLog();
          }, 6000);
        }
      } finally {
        transitioning.current = false;
      }
    },
    [channelId, now, recordLog],
  );

  // ── mpv event handlers (fed by the Rust `mpv:*` Tauri events) ──────────────
  const onProgress = useCallback((t: number) => {
    positionSecRef.current = t;
    lastProgressAtRef.current = Date.now();
    const loaded = currentRef.current;
    if (loaded && loaded.kind === "PROGRAM" && !loaded.baselineReady && baselineArmedRef.current) {
      loaded.playStartCurrentTime = t;
      loaded.baselineReady = true;
      baselineArmedRef.current = false;
    }
    if (!firstProgressRef.current) firstProgressRef.current = true;
  }, []);

  const onLoad = useCallback(
    (e: MpvLoaded) => {
      decodedDimsRef.current = { w: e.width, h: e.height };
      playingRef.current = true;
      if (currentRef.current?.kind === "PROGRAM" && !currentRef.current.baselineReady) baselineArmedRef.current = true;
      if (!pausedRef.current) void mpv.play(); // mpv `pause` persists across loadfile → re-assert
      recordLog(e.width > 0 && e.height > 0 ? "playing" : "not_decoding");
      setStatus((s) => (s.buffering ? { ...s, buffering: false } : s));
    },
    [recordLog],
  );

  const onIdle = useCallback((idle: boolean) => {
    bufferingRef.current = idle;
    setStatus((s) => (s.buffering === idle ? s : { ...s, buffering: idle }));
  }, []);

  const onEof = useCallback(() => {
    // mpv reached the media end. `keep-open` stalls the position clock, so roll to the next slot if
    // we're within 2s of it (tv-native/tv-web's `ended` handler). goTo's guard dedupes with the tick.
    const cur = currentRef.current;
    if (cur?.kind === "PROGRAM" && currentEffective() >= cur.endS - 2) void goTo(cur.endS);
  }, [goTo, currentEffective]);

  // Subscribe to the Rust mpv events once; route to the latest handlers via refs (no resubscribe).
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const onEofRef = useRef(onEof);
  onEofRef.current = onEof;
  useEffect(() => {
    const subs = [
      mpvEvents.onTimePos((t) => onProgressRef.current(t)),
      mpvEvents.onLoaded((e) => onLoadRef.current(e)),
      mpvEvents.onIdle((idle) => onIdleRef.current(idle)),
      mpvEvents.onEof(() => onEofRef.current()),
      mpvEvents.onEnd(() => onEofRef.current()),
    ];
    return () => subs.forEach((p) => void p.then((u) => u()));
  }, []);

  const buildScrubber = useCallback((effective: number, nowS: number): ScrubberView => {
    const slots = slotsRef.current;
    const behindS = Math.max(0, nowS - effective);
    const atLive = behindS < LIVE_THRESHOLD;
    const curIdx = slots.findIndex((s) => effective >= s.startS && effective < s.endS);
    const cur = curIdx >= 0 ? slots[curIdx]! : null;
    if (!cur) return { segments: [], thumbPct: 0, livePct: 100, liveVisible: false, slotPositionS: 0, atLive, behindS };
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
  }, []);

  // The tick — derive effectiveTime, roll at boundaries, publish status.
  useEffect(() => {
    const id = setInterval(() => {
      const t = now();
      const wallDt = (Date.now() - lastTick.current) / 1000;
      lastTick.current = Date.now();
      const cur = currentRef.current;
      if (!cur) return;

      if (resumeWatchRef.current && Date.now() >= resumeDeadlineRef.current) {
        const stalledMs = Date.now() - lastProgressAtRef.current;
        if (pausedRef.current || stalledMs < RESUME_STALL_MS) {
          resumeWatchRef.current = false;
          resumeAttemptsRef.current = 0;
        } else if (resumeAttemptsRef.current < RESUME_MAX_RETRIES) {
          resumeAttemptsRef.current += 1;
          resumeDeadlineRef.current = Date.now() + RESUME_STALL_MS;
          void goTo(currentEffective());
          return;
        } else {
          resumeWatchRef.current = false;
          pausedRef.current = true;
          void mpv.pause();
          setStatus((s) => ({ ...s, loading: false, buffering: false, paused: true, error: "Playback stopped. Press Play to retry." }));
          return;
        }
      }

      let effective: number;
      if (cur.kind === "PROGRAM") {
        effective = currentEffective();
        if (effective >= cur.endS - 0.25) {
          void goTo(cur.endS);
          return;
        }
        // Backstop for mpv keep-open EOF (stalls without an END_FILE): near the slot end, if the clock
        // has STALLED while playing for ~1.5s, the media hit EOF → roll into the bumper.
        if (effective >= cur.endS - 10 && !pausedRef.current && !bufferingRef.current) {
          if (Math.abs(positionSecRef.current - lastPosSampleRef.current) < 0.05) stallTicksRef.current += 1;
          else stallTicksRef.current = 0;
          lastPosSampleRef.current = positionSecRef.current;
          if (stallTicksRef.current >= 3) {
            stallTicksRef.current = 0;
            void goTo(cur.endS);
            return;
          }
        } else {
          stallTicksRef.current = 0;
          lastPosSampleRef.current = positionSecRef.current;
        }
      } else {
        if (!pausedRef.current) bumperEffRef.current += wallDt;
        effective = bumperEffRef.current;
        if (effective >= cur.endS) {
          void goTo(cur.endS);
          return;
        }
      }
      const isBumperSlot = cur.kind === "BUMPER";
      setStatus((s) => ({
        ...s,
        loading: false,
        state: isBumperSlot ? "bumper" : "program",
        guide: cur.guide,
        paused: pausedRef.current,
        bumperRemaining: isBumperSlot ? Math.max(0, Math.ceil(cur.endS - effective)) : null,
        bumperElapsed: isBumperSlot ? Math.max(0, effective - cur.startS) : null,
        bumperTotal: isBumperSlot ? Math.max(0, cur.endS - cur.startS) : null,
        bumperKey: isBumperSlot ? String(Math.round(cur.startS)) : null,
        canRestart: cur.kind === "PROGRAM",
        scrubber: scrubberActiveRef.current ? buildScrubber(effective, t) : null,
        delivery: cur.kind === "PROGRAM" ? cur.delivery ?? null : null,
      }));
    }, 500);
    return () => clearInterval(id);
  }, [now, goTo, currentEffective, buildScrubber]);

  // Heartbeat the watch session (~10s) for Now Watching + orphan-transcode reap; end it on unmount.
  useEffect(() => {
    const id = setInterval(() => {
      const cur = currentRef.current;
      if (!channelId || !cur) return;
      const eff = currentEffective();
      void api
        .heartbeat({
          channelId,
          state: cur.kind === "BUMPER" ? "bumper" : "program",
          ratingKey: cur.ratingKey,
          title: titleOf(cur.guide),
          delaySeconds: Math.max(0, Math.round(now() - eff)),
          positionAt: new Date(eff * 1000).toISOString(),
          transcodeSession: cur.session ?? null,
        })
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [channelId, now, currentEffective]);
  useEffect(() => () => void api.endSession().catch(() => {}), []);

  // Channel change (incl. → null on Close): release the current media + reset the clock.
  const prevChannelRef = useRef(channelId);
  useEffect(() => {
    if (prevChannelRef.current === channelId) return;
    prevChannelRef.current = channelId;
    genRef.current++;
    currentRef.current = null;
    currentUrlRef.current = null;
    positionSecRef.current = 0;
    transitioning.current = false;
    resumeWatchRef.current = false;
    if (!channelId) {
      void mpv.stop();
    }
    setStatus((s) => ({ ...s, loading: !!channelId, state: "idle", error: null, guide: null, scrubber: null, delivery: null, paused: false }));
  }, [channelId]);

  // Build slots + bootstrap at live on first load.
  useEffect(() => {
    if (!timeline.data) return;
    clockOffset.current = new Date(timeline.data.serverTime).getTime() - Date.now();
    slotsRef.current = timeline.data.slots.map((slot) => {
      const startS = new Date(slot.startsAt).getTime() / 1000;
      return { slot, startS, endS: startS + slot.durationSeconds };
    });
    if (currentRef.current === null && slotsRef.current.length > 0) void goTo(now());
  }, [timeline.data, goTo, now]);

  // Re-resolve the current program at the same spot on a quality/audio/subtitle change.
  useEffect(() => {
    if (currentRef.current?.kind === "PROGRAM") void goTo(currentEffective());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  const controls = useMemo(
    () => ({
      togglePause: () => {
        const cur = currentRef.current;
        if (cur?.kind === "PROGRAM") {
          if (pausedRef.current) {
            void mpv.play();
            pausedRef.current = false;
            resumeWatchRef.current = true;
            resumeDeadlineRef.current = Date.now() + RESUME_STALL_MS;
            resumeAttemptsRef.current = 0;
          } else {
            void mpv.pause();
            pausedRef.current = true;
            resumeWatchRef.current = false;
          }
        } else {
          pausedRef.current = !pausedRef.current;
        }
        setStatus((s) => ({ ...s, paused: pausedRef.current, error: pausedRef.current ? s.error : null }));
      },
      jumpToLive: () => void goTo(now()),
      seekBy: (seconds: number) => void goTo(currentEffective() + seconds),
      restart: () => {
        const cur = currentRef.current;
        if (!cur) return;
        if (cur.kind === "BUMPER") void goTo(now());
        else void goTo(cur.startS);
      },
    }),
    [goTo, now, currentEffective],
  );

  return { status, controls, tracks, titleOf };
}

/** Placeholder for the tv-native `setMode` (hybrid audio/video engine) — the ambient bumper-music
 *  bed is deferred, so programs are always video. Kept as a call-site marker for when it lands. */
function setMode() {
  /* video-only for now */
}
