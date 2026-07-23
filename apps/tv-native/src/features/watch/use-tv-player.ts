import { useQuery } from "@tanstack/react-query";
import { useVideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";

import { api, type GuideMeta, type MediaInfo, type TimelineSlot } from "@/lib/api";

/**
 * The tv-native channel player — increment 1: the effectiveTime clock model ported from tv-web's
 * `use-tv-player.ts`, driving an **expo-video** player (a different engine than the web `<video>` +
 * hls.js — AVPlayer/ExoPlayer play HLS natively). Derives the current slot + offset from real
 * playback position and rolls at program/bumper boundaries.
 *
 * Deferred to later increments (they need on-device iteration): the DVR scrubber + rewind, track
 * selection, session heartbeat/logging, and native-first direct-play (this increment forces HLS so
 * iPadOS plays reliably until the capability diagnostic provides a measured profile).
 */
type SlotEntry = { slot: TimelineSlot; startS: number; endS: number };
type Current = { index: number; kind: "PROGRAM" | "BUMPER"; startS: number; endS: number; ratingKey: string | null; guide: GuideMeta; offset: number; session: string | null; mode?: MediaInfo["mode"] };

export type PlayerStatus = {
  loading: boolean;
  state: "program" | "bumper" | "off" | "idle";
  guide: GuideMeta | null;
  bumperRemaining: number | null;
  error: string | null;
};

const titleOf = (g?: GuideMeta | null) => (!g ? "" : g.showTitle ? `${g.showTitle} — ${g.title}` : g.title);

export function useTvPlayer(channelId: string) {
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 0.5;
    p.staysActiveInBackground = false;
  });

  const timeline = useQuery({ queryKey: ["timeline", channelId], queryFn: () => api.timeline(channelId, 360, 180), refetchInterval: 120_000 });

  const clockOffset = useRef(0);
  const slotsRef = useRef<SlotEntry[]>([]);
  const currentRef = useRef<Current | null>(null);
  const bumperEffRef = useRef(0);
  const lastTick = useRef(Date.now());
  const genRef = useRef(0);
  const transitioning = useRef(false);

  const [status, setStatus] = useState<PlayerStatus>({ loading: true, state: "idle", guide: null, bumperRemaining: null, error: null });

  const now = useCallback(() => (Date.now() + clockOffset.current) / 1000, []);

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
        // Bumper (or a program with no media) — a client-rendered interstitial; nothing to stream.
        if (entry.slot.kind === "BUMPER" || !entry.slot.ratingKey) {
          player.pause();
          currentRef.current = { index: slots.indexOf(entry), kind: "BUMPER", startS: entry.startS, endS: entry.endS, ratingKey: null, guide: entry.slot.guide, offset: 0, session: null };
          bumperEffRef.current = clamped;
          return;
        }
        const gen = ++genRef.current;
        const offset = Math.max(0, Math.floor(clamped - entry.startS));
        setStatus((s) => ({ ...s, loading: true, error: null }));
        let info: MediaInfo;
        try {
          info = await api.media(channelId, entry.slot.ratingKey, offset, { forceHls: true });
        } catch (err) {
          if (gen !== genRef.current) return;
          setStatus((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : "Playback failed" }));
          return;
        }
        if (gen !== genRef.current) return;
        currentRef.current = { index: slots.indexOf(entry), kind: "PROGRAM", startS: entry.startS, endS: entry.endS, ratingKey: entry.slot.ratingKey, guide: entry.slot.guide, offset, session: info.session, mode: info.mode };
        // HLS transcode bakes the offset in server-side → play from 0. (Direct-play seek comes with
        // the native-first increment.)
        player.replace({ uri: info.url });
        player.play();
      } finally {
        transitioning.current = false;
      }
    },
    [channelId, now, player],
  );

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
        effective = cur.startS + cur.offset + player.currentTime;
        if (effective >= cur.endS - 0.25) {
          void goTo(cur.endS);
          return;
        }
      } else {
        bumperEffRef.current += wallDt;
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
        bumperRemaining: cur.kind === "BUMPER" ? Math.max(0, Math.ceil(cur.endS - effective)) : null,
      }));
    }, 500);
    return () => clearInterval(id);
  }, [now, goTo, player]);

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

  useEffect(() => {
    return () => {
      currentRef.current = null;
    };
  }, []);

  return { player, status, titleOf };
}
