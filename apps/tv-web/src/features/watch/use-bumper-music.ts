import { useEffect, useRef } from "react";

import { api, type BumperMusic } from "../../lib/api";
import { SERVER_URL } from "../../lib/auth-client";

/**
 * Ambient bumper music (§7.14 Phase B, tv-web). A soft bed under the "Up Next" card, DERIVED from the
 * bumper's position on the DVR timeline — not played on an independent timer — so it behaves like part of the
 * bumper: scrub back and the music seeks back with you.
 *
 *  - **Deterministic track:** the track is chosen by hashing the bumper's stable `bumperKey`, so the SAME
 *    bumper always gets the same track (survives scrubbing + re-mounts). No server round-trip, still per-track
 *    cacheable (each track has its own stable URL).
 *  - **Seek + fade from `elapsed`:** the audio position tracks `elapsed % trackDuration` (looping if the track
 *    is shorter than the break), and the volume is a pure function of `elapsed` vs the bumper's `total`
 *    (fade in at the start, fade out before the end). A DVR scrub just moves `elapsed`, so everything follows.
 *
 * A separate `<audio>` (not the video) carries it. When music is disabled or the library is empty, no-op.
 */

/** Non-negative FNV-1a hash of a string — a stable, deterministic index source. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Bed volume as a pure function of position: ramp up over fade-in, ramp down over fade-out. */
function bumperVolume(elapsed: number, total: number, fadeInMs: number, fadeOutMs: number, target: number): number {
  const fin = fadeInMs / 1000;
  const fout = fadeOutMs / 1000;
  let v = target;
  if (fin > 0 && elapsed < fin) v = target * (elapsed / fin);
  const remaining = total - elapsed;
  if (fout > 0 && remaining < fout) v = Math.min(v, (target * Math.max(0, remaining)) / fout);
  return Math.max(0, Math.min(target, v));
}

// Only re-seek the audio when it diverges from the timeline by more than this (a real DVR scrub) — so normal
// playback isn't constantly re-seeking (which would stutter).
const SEEK_THRESHOLD = 1.5;

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const durRef = useRef<number | null>(null);

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
    const audio = new Audio(`${SERVER_URL}${track.url}`);
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;
    durRef.current = null;
    const onMeta = () => {
      durRef.current = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null;
    };
    audio.addEventListener("loadedmetadata", onMeta);
    // Autoplay is allowed — the user tuned in (a keypress) and the page is already producing audio; a rare
    // block is caught and simply stays silent.
    void audio.play().catch(() => {});

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      durRef.current = null;
    };
  }, [active, bumperKey]);

  // Sync volume + position to the timeline every tick (and on scrub) — the whole point: it FOLLOWS `elapsed`.
  useEffect(() => {
    const cfg = cfgRef.current;
    const audio = audioRef.current;
    if (!audio || !cfg || !active || elapsed == null || total == null) return;

    const target = Math.max(0, Math.min(1, cfg.volume / 100));
    audio.volume = bumperVolume(elapsed, total, cfg.fadeInMs, cfg.fadeOutMs, target);

    const dur = durRef.current;
    if (dur && dur > 0) {
      const desired = elapsed % dur;
      if (Math.abs(audio.currentTime - desired) > SEEK_THRESHOLD) audio.currentTime = desired;
    }
  }, [active, elapsed, total]);
}
