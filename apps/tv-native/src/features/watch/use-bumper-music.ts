import { mpvAudio, type MpvAudioProgress } from "@ChannelGuide/mpv-player";
import { useEffect, useRef } from "react";

import { api, type BumperMusic } from "../../lib/api";
import { getServerUrl } from "../../lib/auth";

/**
 * Ambient bumper music (§7.14 Phase B, tv-native) — the twin of tv-web's `use-bumper-music`, but backed by
 * the headless `mpvAudio` core (a second, surface-less libmpv instance) instead of a web `<audio>`.
 *
 * Same DVR-derived model: the track is chosen **deterministically** from the stable `bumperKey` (so the same
 * bumper always gets the same track, surviving scrubs), and its **position + volume are functions of the
 * bumper's `elapsed`** — so scrubbing back into/through a bumper seeks + re-fades the music with it.
 *
 * Native difference: `mpvAudio.setVolume` is an async bridge call, so we DON'T ramp at 60fps (too chatty).
 * A ~60ms interval interpolates `elapsed` and sends volume only when it meaningfully changes (constant in the
 * full-volume middle → no calls); position re-seeks only on a real scrub. Reuses the single audio core, so it
 * lives on the persistent player host (plays full-screen AND docked, like tv-web).
 */

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function bumperVolume(elapsed: number, total: number, fadeInMs: number, fadeOutMs: number, target: number): number {
  const fin = fadeInMs / 1000;
  const fout = fadeOutMs / 1000;
  let v = target;
  if (fin > 0 && elapsed < fin) v = target * (elapsed / fin);
  const remaining = total - elapsed;
  if (fout > 0 && remaining < fout) v = Math.min(v, (target * Math.max(0, remaining)) / fout);
  return Math.max(0, Math.min(target, v));
}

const SEEK_THRESHOLD = 1.5;
const VOLUME_STEP_MS = 60;

export function useBumperMusic({
  active,
  elapsed,
  total,
  bumperKey,
}: {
  active: boolean;
  elapsed: number | null;
  total: number | null;
  bumperKey: string | null;
}) {
  const cfgRef = useRef<BumperMusic | null>(null);
  const posRef = useRef<{ elapsed: number; total: number; ts: number } | null>(null);
  const audioTimeRef = useRef(0); // latest mpv audio position (from onProgress)
  const audioDurRef = useRef(0); // latest mpv audio duration (from onProgress)
  const lastVolRef = useRef(-1);

  // Settings + track pool, fetched once for the session.
  useEffect(() => {
    let cancelled = false;
    api
      .bumperMusic()
      .then((d) => {
        if (!cancelled) cfgRef.current = d;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // One track per bumper occurrence — start on a new bumperKey, tear down when it ends (key → null / inactive).
  useEffect(() => {
    if (!active || !bumperKey) return;
    const cfg = cfgRef.current;
    if (!cfg || !cfg.enabled || cfg.tracks.length === 0) return;

    const track = cfg.tracks[hashString(bumperKey) % cfg.tracks.length]!;
    audioTimeRef.current = 0;
    audioDurRef.current = 0;
    lastVolRef.current = -1;

    const sub = mpvAudio.onProgress((e: MpvAudioProgress) => {
      audioTimeRef.current = e.currentTime;
      if (e.duration > 0) audioDurRef.current = e.duration;
    });

    void (async () => {
      await mpvAudio.load(`${getServerUrl()}${track.url}`);
      await mpvAudio.setLoop(true);
      await mpvAudio.setVolume(0);
      await mpvAudio.play();
    })();

    return () => {
      sub.remove();
      void mpvAudio.stop();
    };
  }, [active, bumperKey]);

  // Reconcile on each player tick: record the authoritative position + snap the audio position on a real scrub.
  useEffect(() => {
    if (!active || elapsed == null || total == null) {
      posRef.current = null;
      return;
    }
    posRef.current = { elapsed, total, ts: Date.now() };
    const dur = audioDurRef.current;
    if (dur > 0) {
      const desired = elapsed % dur;
      if (Math.abs(audioTimeRef.current - desired) > SEEK_THRESHOLD) void mpvAudio.seek(desired);
    }
  }, [active, elapsed, total]);

  // Smooth-ish fade: interpolate elapsed on a light interval and push volume only when it changes (the
  // full-volume middle sends nothing; a fade sends ~16/s for ~1s — easy on the bridge).
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const cfg = cfgRef.current;
      const pos = posRef.current;
      if (!cfg || !pos) return;
      const targetMax = Math.max(0, Math.min(1, cfg.volume / 100));
      const local = Math.max(0, Math.min(pos.total, pos.elapsed + (Date.now() - pos.ts) / 1000));
      const v = bumperVolume(local, pos.total, cfg.fadeInMs, cfg.fadeOutMs, targetMax);
      if (Math.abs(v - lastVolRef.current) >= 0.02 || (v === 0 && lastVolRef.current !== 0)) {
        lastVolRef.current = v;
        void mpvAudio.setVolume(v);
      }
    }, VOLUME_STEP_MS);
    return () => clearInterval(id);
  }, [active]);
}
