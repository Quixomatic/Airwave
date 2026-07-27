import { useQuery } from "@tanstack/react-query";
import type { MpvPlayerViewRef } from "@ChannelGuide/mpv-player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type GuideMeta, type MediaInfo, type Track, type TimelineSlot } from "@/lib/api";
import { deviceId } from "@/lib/device";

/**
 * The tv-native channel player — the effectiveTime clock + DVR ported from tv-web's `use-tv-player`,
 * driving an **mpv** view (`@ChannelGuide/mpv-player`, source-prop + event-driven, seconds — a real seekable media element). Derives the current slot + offset from real
 * playback position, rolls at boundaries, and — the DVR — `goTo(anyTime)` rewinds OUT of the current
 * program through the bumper into the previous one. Emits a multi-segment scrubber view.
 *
 * Still deferred (needs the libVLC swap / more device iteration): session heartbeat/logging, track
 * selection wiring, native-first direct-play retry. HLS/transcode is handled by the server profile.
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
// Resume-stall watchdog: after unpausing, if mpv produces NO progress for this long, the stream is dead
// (a paused Plex session got reaped) → re-establish at the same spot. Bounded by MAX_RETRIES consecutive
// reloads (reset on any real progress) so a permanently-dead stream can't loop.
const RESUME_STALL_MS = 5000;
const RESUME_MAX_RETRIES = 2;

const titleOf = (g?: GuideMeta | null) => (!g ? "" : g.showTitle ? `${g.showTitle} — ${g.title}` : g.title);

export type PlayerOptions = { quality?: string; audioStreamId?: string; subtitleStreamId?: string };

export function useTvPlayer(channelId: string | null, options: PlayerOptions = {}, scrubberActive = true) {
  const viewRef = useRef<MpvPlayerViewRef>(null);
  const [source, setSource] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(0); // mpv open-at position (seconds) — loadfile … start=<offset>
  const positionSecRef = useRef(0); // latest onProgress currentTime (seconds); the effectiveTime clock reads this
  const playingRef = useRef(false);
  const paramsKey = `${options.quality ?? ""}|${options.audioStreamId ?? ""}|${options.subtitleStreamId ?? ""}`;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Only the feature panel (full-screen chrome) shows the scrubber, so only build it when full — skip the
  // per-tick `buildScrubber` while a mini player is docked (browsing the guide) or off. Ref so the tick
  // reads the latest without re-creating the interval.
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
  const decodedDimsRef = useRef({ w: 0, h: 0 }); // onFirstPlay MediaInfo dims, for PlaybackLog
  const logCtxRef = useRef<Record<string, unknown> | null>(null); // last program-load context
  const loadStartRef = useRef(0); // Date.now() at setSource, for the [vlc] event timeline in Metro
  const currentUrlRef = useRef<string | null>(null); // last loaded URL — a same-URL goTo = DVR seek within the current direct file
  const firstProgressRef = useRef(false); // did the first onProgress arrive for the current load?
  const stallTicksRef = useRef(0); // consecutive ticks mpv's clock hasn't advanced (near-end EOF detect)
  const lastPosSampleRef = useRef(0); // last positionSecRef the tick sampled, for the stall check
  const baselineArmedRef = useRef(false); // onLoad barrier: only anchor the baseline once the NEW source
  // has loaded, so a stale onProgress from the outgoing stream can't anchor the new program's baseline.
  const bufferingRef = useRef(false); // latest onBuffering state — for the watchdog's stuck-diagnosis
  const loggedRef = useRef(false); // already logged this load (onLoad/onError)? the watchdog skips if so
  // Resume-stall watchdog state (see RESUME_STALL_MS): armed on unpause; the tick reloads if mpv's clock
  // hasn't produced a progress event within the window; capped by resumeAttemptsRef (reset on progress).
  const lastProgressAtRef = useRef(0); // Date.now() of the last onProgress — the liveness signal
  const resumeWatchRef = useRef(false);
  const resumeDeadlineRef = useRef(0);
  const resumeAttemptsRef = useRef(0);

  const [tracks, setTracks] = useState<{ audio: Track[]; subtitle: Track[] }>({ audio: [], subtitle: [] });
  const [status, setStatus] = useState<PlayerStatus>({ loading: true, buffering: false, state: "idle", guide: null, paused: false, bumperRemaining: null, canRestart: false, error: null, scrubber: null, delivery: null });

  const now = useCallback(() => (Date.now() + clockOffset.current) / 1000, []);

  // PlaybackLog: one row per program load — the server's decision (mode/codecs/connection, captured in
  // goTo) + the real on-device outcome (libVLC first-play dims, or an error message).
  const recordLog = useCallback((outcome?: "playing" | "not_decoding" | "error", errorDetail?: string | null) => {
    const ctx = logCtxRef.current;
    if (!ctx) return;
    loggedRef.current = true;
    const dims = decodedDimsRef.current;
    const decoded = dims.w > 0 && dims.h > 0;
    const finalOutcome = outcome ?? (decoded ? "playing" : "not_decoding");
    // For a stuck load (watchdog, no onLoad/onError) record WHY: did a frame ever arrive, was mpv buffering?
    const diag =
      errorDetail ?? (finalOutcome === "not_decoding" ? `stuck: firstFrame=${firstProgressRef.current} buffering=${bufferingRef.current}` : null);
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
          setSource(null);
          setStatus((s) => ({ ...s, loading: false, state: "off" }));
          return;
        }
        if (entry.slot.kind === "BUMPER" || !entry.slot.ratingKey) {
          void viewRef.current?.pause();
          currentRef.current = { index: slots.indexOf(entry), kind: "BUMPER", startS: entry.startS, endS: entry.endS, ratingKey: null, guide: entry.slot.guide, offset: 0, playStartCurrentTime: 0, baselineReady: true, session: null };
          bumperEffRef.current = clamped;
          pausedRef.current = false;
          return;
        }
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
        // mpv loads by setting the source prop; `startTime` opens direct-play AT the offset (loadfile
        // start=). Baseline is set in onLoad/onFirstFrame — see the event handlers below.
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
        if (sameMedia && info.mode === "direct") {
          // DVR seek WITHIN the same direct file (same URL → no reload): mpv seeks fast (ffmpeg estimate).
          console.log(`[mpv] SEEK ${offset}s (same media)`);
          loaded.playStartCurrentTime = offset;
          loaded.baselineReady = true;
          positionSecRef.current = offset;
          void viewRef.current?.seek(offset);
          // mpv `pause` is a PERSISTENT property (survives loadfile/seek). A bumper paused it; a
          // same-media DVR seek back into this program won't fire onLoad, so resume here explicitly.
          void viewRef.current?.play();
        } else {
          decodedDimsRef.current = { w: 0, h: 0 };
          positionSecRef.current = 0;
          firstProgressRef.current = false;
          // Disarm: the baseline anchors only after THIS new source's onLoad fires (barrier below), so a
          // stale onProgress from the outgoing stream can't anchor it. Until then currentEffective uses
          // the baselineReady=false path (startS + offset = the target), which is already correct.
          baselineArmedRef.current = false;
          bufferingRef.current = false;
          loggedRef.current = false;
          console.log(`[mpv] LOAD mode=${info.mode} offset=${offset}s conn=${info.connection ?? "?"} ${info.container ?? "?"}/${info.videoCodec ?? "?"}/${info.audioCodec ?? "?"} ${info.url.slice(0, 90)}`);
          setStartTime(info.mode === "direct" ? offset : 0);
          setSource(info.url);
          // Watchdog (tv-web's pattern): whether or not onLoad/onError ever fires, post ONE PlaybackLog
          // row ~6s later capturing the real outcome — so a stuck load still records (firstFrame/buffering).
          setTimeout(() => {
            if (gen === genRef.current && !loggedRef.current) recordLog();
          }, 6000);
        }
      } finally {
        transitioning.current = false;
      }
    },
    [channelId, now],
  );

  // mpv view events — returned as `videoEvents`, spread onto <MpvPlayerView>. currentTime is in SECONDS
  // (mpv `time-pos` — absolute media time, exactly like an HTML <video>, so the tv-web clock maps 1:1).
  const onProgress = useCallback((e: { nativeEvent: { currentTime: number } }) => {
    const t = e.nativeEvent.currentTime;
    positionSecRef.current = t;
    lastProgressAtRef.current = Date.now(); // liveness for the resume-stall watchdog
    // Baseline (tv-web's model, mode-agnostic): the clock is `startS + offset + (currentTime −
    // playStartCurrentTime)`, so anchor playStartCurrentTime to the FIRST real position of the NEW
    // stream — wherever it actually opens (direct → the offset; HLS → 0-based or offset-based, doesn't
    // matter). ARMED only after the new source's onLoad (barrier), so a stale onProgress from the
    // outgoing stream can't anchor it. `baselineReady` guards resume-from-pause from re-anchoring.
    const loaded = currentRef.current;
    if (loaded && loaded.kind === "PROGRAM" && !loaded.baselineReady && baselineArmedRef.current) {
      loaded.playStartCurrentTime = t;
      loaded.baselineReady = true;
      baselineArmedRef.current = false;
    }
    if (!firstProgressRef.current) {
      firstProgressRef.current = true;
      console.log(`[mpv] +${Date.now() - loadStartRef.current}ms FIRST-PROGRESS t=${t.toFixed(1)}s`);
    }
  }, []);
  // onLoad = mpv `file-loaded` (parsed dims/duration): PlaybackLog + ARM the baseline barrier + "playing".
  const onLoad = useCallback(
    (e: { nativeEvent: { duration: number; width: number; height: number } }) => {
      const { width, height } = e.nativeEvent;
      console.log(`[mpv] +${Date.now() - loadStartRef.current}ms LOADED ${width}x${height}`);
      decodedDimsRef.current = { w: width, h: height };
      playingRef.current = true;
      // The new source is now loaded → arm baseline anchoring (the next onProgress belongs to THIS
      // stream, not the outgoing one). Skip if already anchored (same-media seek path sets it inline).
      if (currentRef.current?.kind === "PROGRAM" && !currentRef.current.baselineReady) baselineArmedRef.current = true;
      // A fresh program load: resume unless the user paused. mpv's `pause` persists across loadfile,
      // so after a bumper (which paused) the next program would paint its first frame but stay paused —
      // exactly tv-web's `tryPlay(video)` on every load.
      if (!pausedRef.current) void viewRef.current?.play();
      recordLog(width > 0 && height > 0 ? "playing" : "not_decoding");
      setStatus((s) => (s.buffering ? { ...s, buffering: false } : s));
    },
    [recordLog],
  );
  // onFirstFrame = mpv `playback-restart` (first painted frame after load/seek).
  const onFirstFrame = useCallback(() => {
    console.log(`[mpv] +${Date.now() - loadStartRef.current}ms FIRST-FRAME`);
    setStatus((s) => (s.buffering ? { ...s, buffering: false } : s));
  }, []);
  const onBuffering = useCallback((e: { nativeEvent: { buffering: boolean } }) => {
    const buffering = e.nativeEvent.buffering;
    bufferingRef.current = buffering;
    console.log(`[mpv] +${Date.now() - loadStartRef.current}ms BUFFERING ${buffering}`);
    setStatus((s) => (s.buffering === buffering ? s : { ...s, buffering }));
  }, []);
  const onError = useCallback(
    (e: { nativeEvent: { message: string } }) => {
      const message = e.nativeEvent.message;
      console.log(`[mpv] +${Date.now() - loadStartRef.current}ms ERROR ${message}`);
      setStatus((s) => ({ ...s, loading: false, error: message || "Playback failed" }));
      recordLog("error", message);
    },
    [recordLog],
  );
  const onEnd = useCallback(
    (e: { nativeEvent: { reason: string } }) => {
      const reason = e.nativeEvent.reason;
      console.log(`[mpv] END ${reason}`);
      if (reason !== "eof") return;
      // mpv reached the media end. `keep-open` holds the last frame and STALLS the position clock, so the
      // tick's effective time can freeze just shy of the slot end and never cross its 0.25s rollover
      // threshold — leaving playback stuck at the end of the program with no bumper (intermittent, since
      // it depends on how close the stall is to the boundary). Roll to the next slot on EOF if we're
      // within 2s of it (tv-web's `ended` handler). goTo's transitioning guard dedupes with the tick.
      const cur = currentRef.current;
      if (cur?.kind === "PROGRAM" && currentEffective() >= cur.endS - 2) void goTo(cur.endS);
    },
    [goTo, currentEffective],
  );

  // Multi-segment scrubber view — the PROGRAM you're in is the expanded middle, flanked by fixed
  // left/right peeks (prev tail + bumper, upcoming bumper + next head). Ported from tv-web.
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

      // Resume-stall watchdog — after unpausing, if no progress event arrived within the window the stream
      // is dead (reaped Plex session); re-establish at the same spot. Bounded: at most RESUME_MAX_RETRIES
      // consecutive reloads, reset by any real progress; then give up in a retryable paused state (never a
      // reload loop). A progress event within the window OR a re-pause = healthy → disarm.
      if (resumeWatchRef.current && Date.now() >= resumeDeadlineRef.current) {
        const stalledMs = Date.now() - lastProgressAtRef.current;
        if (pausedRef.current || stalledMs < RESUME_STALL_MS) {
          resumeWatchRef.current = false;
          resumeAttemptsRef.current = 0;
        } else if (resumeAttemptsRef.current < RESUME_MAX_RETRIES) {
          resumeAttemptsRef.current += 1;
          resumeDeadlineRef.current = Date.now() + RESUME_STALL_MS; // re-arm for the reload
          console.log(`[mpv] resume stalled — reload ${resumeAttemptsRef.current}/${RESUME_MAX_RETRIES}`);
          void goTo(currentEffective());
          return;
        } else {
          // Give up, but leave it retryable: model as paused so Play re-arms the watchdog with a fresh budget.
          resumeWatchRef.current = false;
          pausedRef.current = true;
          void viewRef.current?.pause();
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
        // Backstop for mpv's keep-open EOF (it pauses on the last frame WITHOUT an END_FILE event, so the
        // clock stalls just shy of the boundary and the check above never fires — the intermittent
        // "stuck at the end, no bumper" bug). Near the slot end, if the position clock has STALLED while
        // playing (not paused/buffering) for ~1.5s, the media hit EOF → roll into the bumper.
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
      setStatus((s) => ({
        ...s,
        loading: false,
        state: cur.kind === "BUMPER" ? "bumper" : "program",
        guide: cur.guide,
        paused: pausedRef.current,
        bumperRemaining: cur.kind === "BUMPER" ? Math.max(0, Math.ceil(cur.endS - effective)) : null,
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
      void api.heartbeat({ channelId, state: cur.kind === "BUMPER" ? "bumper" : "program", ratingKey: cur.ratingKey, title: titleOf(cur.guide), transcodeSession: cur.session ?? null }).catch(() => {});
    }, 10_000);
    return () => clearInterval(id);
  }, [channelId]);
  useEffect(() => () => void api.endSession().catch(() => {}), []);

  // Channel change (incl. → null on Close): release the current media + reset the clock. A non-null
  // change leaves the mounted <MpvPlayerView> and swaps its source (mpv loadfile replace) below; null
  // unmounts it (deinit → mpv teardown). The new channel's timeline (keyed query) bootstraps below.
  const prevChannelRef = useRef(channelId);
  useEffect(() => {
    if (prevChannelRef.current === channelId) return;
    prevChannelRef.current = channelId;
    genRef.current++; // invalidate any in-flight goTo resolve
    currentRef.current = null;
    // Clear the last-loaded URL so a re-tune of the SAME channel after Close reloads (sets `source` →
    // remounts the view) instead of taking the "same media → seek" path against the now-unmounted view.
    currentUrlRef.current = null;
    positionSecRef.current = 0;
    transitioning.current = false;
    resumeWatchRef.current = false; // disarm the resume-stall watchdog across channel change / Close
    if (!channelId) {
      // Close: pause + release. The view is conditionally rendered on `source`, so nulling it unmounts
      // the MpvPlayerView (deinit → mpv_terminate_destroy); pause() first halts audio so nothing leaks.
      void viewRef.current?.pause();
      setSource(null);
    }
    // Channel change (channelId non-null): leave the old source playing in the mounted view — bootstrap
    // swaps in the new URL below. One player, one surface, no remount (no double-audio, no re-attach).
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
          // Toggle off the ACTUAL pause state. Using `playingRef` here was the bug: it's set true on load
          // and never cleared, so this always took the pause branch — pressing play/pause again just
          // re-paused and never resumed (only a seek resumed, because goTo explicitly calls play()).
          if (pausedRef.current) {
            void viewRef.current?.play();
            pausedRef.current = false;
            // Arm the resume-stall watchdog with a FRESH retry budget — a manual Play is always a new try
            // (this is also the recovery path from a "Playback stopped" give-up).
            resumeWatchRef.current = true;
            resumeDeadlineRef.current = Date.now() + RESUME_STALL_MS;
            resumeAttemptsRef.current = 0;
          } else {
            void viewRef.current?.pause();
            pausedRef.current = true;
            resumeWatchRef.current = false; // disarm while paused
          }
        } else {
          pausedRef.current = !pausedRef.current;
        }
        // On resume, clear a prior "Playback stopped" so pressing Play dismisses it immediately.
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

  const videoEvents = useMemo(
    () => ({ onLoad, onFirstFrame, onProgress, onBuffering, onError, onEnd }),
    [onLoad, onFirstFrame, onProgress, onBuffering, onError, onEnd],
  );

  return { viewRef, source, startTime, videoEvents, status, controls, tracks, titleOf };
}
