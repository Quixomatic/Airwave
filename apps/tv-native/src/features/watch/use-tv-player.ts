import { useQuery } from "@tanstack/react-query";
import { useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, type GuideMeta, type MediaInfo, type Track, type TimelineSlot } from "@/lib/api";
import { deviceId } from "@/lib/device";

/**
 * The tv-native channel player — the effectiveTime clock + DVR ported from tv-web's `use-tv-player`,
 * driving an **expo-video** player (AVPlayer/ExoPlayer). Derives the current slot + offset from real
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

const titleOf = (g?: GuideMeta | null) => (!g ? "" : g.showTitle ? `${g.showTitle} — ${g.title}` : g.title);

export type PlayerOptions = { quality?: string; audioStreamId?: string; subtitleStreamId?: string };

export function useTvPlayer(channelId: string, options: PlayerOptions = {}) {
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = false;
  });
  const paramsKey = `${options.quality ?? ""}|${options.audioStreamId ?? ""}|${options.subtitleStreamId ?? ""}`;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const timeline = useQuery({ queryKey: ["timeline", channelId], queryFn: () => api.timeline(channelId, 360, 180), refetchInterval: 120_000 });

  const clockOffset = useRef(0);
  const slotsRef = useRef<SlotEntry[]>([]);
  const currentRef = useRef<Current | null>(null);
  const bumperEffRef = useRef(0);
  const pausedRef = useRef(false);
  const lastTick = useRef(Date.now());
  const genRef = useRef(0);
  const transitioning = useRef(false);

  const [tracks, setTracks] = useState<{ audio: Track[]; subtitle: Track[] }>({ audio: [], subtitle: [] });
  const [status, setStatus] = useState<PlayerStatus>({ loading: true, buffering: false, state: "idle", guide: null, paused: false, bumperRemaining: null, canRestart: false, error: null, scrubber: null, delivery: null });

  const now = useCallback(() => (Date.now() + clockOffset.current) / 1000, []);

  const currentEffective = useCallback((): number => {
    const cur = currentRef.current;
    if (!cur) return now();
    if (cur.kind === "PROGRAM") return cur.baselineReady ? cur.startS + cur.offset + (player.currentTime - cur.playStartCurrentTime) : cur.startS + cur.offset;
    return bumperEffRef.current;
  }, [now, player]);

  const goTo = useCallback(
    async (target: number) => {
      const slots = slotsRef.current;
      if (slots.length === 0 || transitioning.current) return;
      transitioning.current = true;
      try {
        const clamped = Math.min(now(), Math.max(slots[0]!.startS, target));
        const entry = slots.find((s) => clamped >= s.startS && clamped < s.endS);
        if (!entry) {
          currentRef.current = null;
          player.pause();
          setStatus((s) => ({ ...s, loading: false, state: "off" }));
          return;
        }
        if (entry.slot.kind === "BUMPER" || !entry.slot.ratingKey) {
          player.pause();
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
        void player.replaceAsync({ uri: info.url }).then(() => player.play()).catch(() => {});
        const sub = player.addListener("statusChange", ({ status: st }) => {
          if (st !== "readyToPlay" || currentRef.current !== loaded) return;
          if (info.mode === "direct" && offset > 0) {
            player.currentTime = offset;
            loaded.playStartCurrentTime = offset;
          } else {
            loaded.playStartCurrentTime = player.currentTime;
          }
          loaded.baselineReady = true;
          sub.remove();
        });
      } finally {
        transitioning.current = false;
      }
    },
    [channelId, now, player],
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
      setStatus((s) => ({
        ...s,
        loading: false,
        state: cur.kind === "BUMPER" ? "bumper" : "program",
        guide: cur.guide,
        paused: pausedRef.current,
        bumperRemaining: cur.kind === "BUMPER" ? Math.max(0, Math.ceil(cur.endS - effective)) : null,
        canRestart: cur.kind === "PROGRAM",
        scrubber: buildScrubber(effective, t),
        delivery: cur.kind === "PROGRAM" ? cur.delivery ?? null : null,
      }));
    }, 500);
    return () => clearInterval(id);
  }, [now, goTo, currentEffective, buildScrubber]);

  // Buffering feedback from the player status.
  useEffect(() => {
    const sub = player.addListener("statusChange", ({ status: st }) => {
      setStatus((s) => {
        const buffering = st === "loading";
        return s.buffering === buffering ? s : { ...s, buffering };
      });
    });
    return () => sub.remove();
  }, [player]);

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
          if (player.playing) player.pause();
          else player.play();
          pausedRef.current = player.playing;
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
        if (cur.kind === "BUMPER") void goTo(now());
        else void goTo(cur.startS);
      },
    }),
    [goTo, now, currentEffective, player],
  );

  return { player, status, controls, tracks, titleOf };
}
