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
 * Native difference: the fade is done NATIVELY — each ~500ms player tick sends one `fadeVolume(target, ms)`
 * (only when the target changes), and the native core does the buttery 60fps ramp off-bridge. So the
 * steady full-volume middle sends nothing, a fade is ~2 bridge calls/sec, and a scrub snaps quickly. Reuses
 * the single audio core, so it lives on the persistent player host (plays full-screen AND docked, like tv-web).
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
// Native fade a touch longer than the player tick (~500ms) so ramps stay continuous between ticks; a scrub
// snaps faster.
const TICK_FADE_MS = 600;
const SEEK_FADE_MS = 250;

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
  const audioTimeRef = useRef(0); // latest mpv audio position (from onProgress)
  const audioDurRef = useRef(0); // latest mpv audio duration (from onProgress)
  const lastVolRef = useRef(-1);
  const lastElapsedRef = useRef<number | null>(null);

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
    lastElapsedRef.current = null;

    const sub = mpvAudio.onProgress((e: MpvAudioProgress) => {
      audioTimeRef.current = e.currentTime;
      if (e.duration > 0) audioDurRef.current = e.duration;
    });

    void (async () => {
      await mpvAudio.load(`${getServerUrl()}${track.url}`);
      await mpvAudio.setLoop(true);
      await mpvAudio.setVolume(0); // start silent; the reconcile below fades it in
      await mpvAudio.play();
    })();

    return () => {
      sub.remove();
      void mpvAudio.stop();
    };
  }, [active, bumperKey]);

  // Reconcile on each player tick (and on scrub): drive volume + position from the bumper's timeline
  // position. Volume is the elapsed-derived target (fade in at start, full middle, fade out at end); each
  // change is handed to the NATIVE fade so the ramp is buttery off-bridge. Position snaps on a real scrub.
  useEffect(() => {
    if (!active || elapsed == null || total == null) return;
    const cfg = cfgRef.current;
    if (!cfg) return;

    const targetMax = Math.max(0, Math.min(1, cfg.volume / 100));
    const v = bumperVolume(elapsed, total, cfg.fadeInMs, cfg.fadeOutMs, targetMax);
    const jumped = lastElapsedRef.current == null || Math.abs(elapsed - lastElapsedRef.current) > SEEK_THRESHOLD;
    lastElapsedRef.current = elapsed;

    if (jumped || Math.abs(v - lastVolRef.current) >= 0.01) {
      lastVolRef.current = v;
      void mpvAudio.fadeVolume(v, jumped ? SEEK_FADE_MS : TICK_FADE_MS);
    }

    const dur = audioDurRef.current;
    if (dur > 0) {
      const desired = elapsed % dur;
      if (Math.abs(audioTimeRef.current - desired) > SEEK_THRESHOLD) void mpvAudio.seek(desired);
    }
  }, [active, elapsed, total]);
}
