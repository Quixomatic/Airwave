import { Audio, interpolate, Sequence, staticFile } from "remotion";
import {
  FPS,
  MUSIC_BED,
  MUSIC_DUCK,
  MUSIC_DUCK_RAMP_SEC,
  MUSIC_FADE_IN_SEC,
  MUSIC_FADE_OUT_SEC,
  MUSIC_VOL,
  TOTAL_SEC,
  VO,
  VO_FADE_SEC,
  VO_VOL,
} from "../theme";

/**
 * The reel's audio layer — no visual output. Everything is frame-driven the Remotion way (volume automation
 * via per-frame `volume` callbacks + `interpolate`), so it's fully deterministic and seek-safe (no wall-clock,
 * no manual RAF).
 *
 * - Voiceover: one clip per scene, mounted in a `<Sequence>` at its scene's absolute start (from `VO`), with a
 *   tiny click-safe fade-in. Clips play their natural length. Only `have` clips mount, so a not-yet-generated
 *   line never 404s.
 * - Music bed: one looped `<Audio>` under the whole reel whose volume is computed per frame — faded in/out at
 *   the ends and DUCKED down whenever a VO line is speaking, with smooth ramps, so narration always sits on top.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 (no narration) → 1 (a VO line is fully active) at time `sec`, with smooth edge ramps. `have` clips only. */
function duckAmountAt(sec: number): number {
  let amt = 0;
  const r = MUSIC_DUCK_RAMP_SEC;
  for (const v of VO) {
    if (!v.have) continue;
    const a = v.atSec;
    const b = v.atSec + v.winSec;
    const rampUp = interpolate(sec, [a - r, a], [0, 1], clamp);
    const rampDown = interpolate(sec, [b, b + r], [1, 0], clamp);
    amt = Math.max(amt, Math.min(rampUp, rampDown));
  }
  return amt;
}

/** Music-bed volume at composition frame `frame`: fade in/out envelope × duck level. */
function musicVolume(frame: number): number {
  const sec = frame / FPS;
  const fadeIn = interpolate(sec, [0, MUSIC_FADE_IN_SEC], [0, 1], clamp);
  const fadeOut = interpolate(sec, [TOTAL_SEC - MUSIC_FADE_OUT_SEC, TOTAL_SEC], [1, 0], clamp);
  const envelope = Math.min(fadeIn, fadeOut);
  const level = MUSIC_VOL + (MUSIC_DUCK - MUSIC_VOL) * duckAmountAt(sec);
  return level * envelope;
}

export const Soundtrack: React.FC = () => {
  const voFade = Math.max(1, Math.round(VO_FADE_SEC * FPS));
  return (
    <>
      {VO.filter((v) => v.have).map((v) => (
        <Sequence key={v.id} from={Math.round(v.atSec * FPS)} layout="none" name={`vo:${v.id}`}>
          {/* frame here is local to the clip → fade in over the first few frames (click-safe). */}
          <Audio src={staticFile(v.file)} volume={(f) => interpolate(f, [0, voFade], [0, VO_VOL], clamp)} />
        </Sequence>
      ))}
      {MUSIC_BED ? <Audio src={staticFile(MUSIC_BED)} volume={musicVolume} loop name="music-bed" /> : null}
    </>
  );
};
