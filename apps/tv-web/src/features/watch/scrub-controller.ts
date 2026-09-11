/**
 * Debounced-scrub controller — framework-agnostic (no React/DOM). It lets ◄/► move a PREVIEW playhead
 * quickly (with press-and-hold acceleration) while committing only ONE real seek after the user settles.
 *
 * It never seeks itself: it accumulates a clamped target and calls `commit(target)` once, ~`commitMs` after
 * the last input. `onPreview(target)` fires on every step so the UI can render the moving thumb; the caller
 * decides when to drop the preview (so the thumb can stay pinned through a slow transcode load). This is the
 * single control point — nothing about the underlying direct/transcode seek changes.
 *
 * Portable by design (tv-native / tv-tauri could reuse it; Roku reimplements the same spec), but it currently
 * lives in tv-web only.
 */
export type ScrubControllerOptions = {
  /** Current committed position (seconds) — the base for the first step of a fresh scrub. */
  getPosition: () => number;
  /** Earliest scrubbable position (DVR start). */
  getFloor: () => number;
  /** Live edge (now) — the upper bound; you can't scrub past live. */
  getLive: () => number;
  /** Fired on every step with the clamped preview target, and with `null` when a scrub is cancelled. */
  onPreview: (target: number | null) => void;
  /** Fired ONCE, ~commitMs after the last step, to perform the real seek. */
  commit: (target: number) => void;
  /** Per-step seconds, ramping as a hold continues (last value repeats). Default [10,10,10,30,30,60]. */
  steps?: number[];
  /** Presses within this window (ms) count as a continued hold (accelerate). Default 400. */
  accelWindowMs?: number;
  /** Idle time (ms) after the last step before the commit fires. Default 500. */
  commitMs?: number;
};

export type ScrubController = {
  /** Advance the preview one (accelerated) step in `direction` and (re)arm the debounced commit. */
  scrub: (direction: 1 | -1) => void;
  /** Commit the pending target immediately (e.g. before another explicit action). No-op if idle. */
  flush: () => void;
  /** Drop the pending scrub without committing (e.g. jump-to-live/restart override). */
  cancel: () => void;
  /** True while a scrub is accumulating (before its commit fires). */
  isScrubbing: () => boolean;
};

export function createScrubController(opts: ScrubControllerOptions): ScrubController {
  // Acceleration is OFF for now (James testing a flat feel): every step is 10s, hold or tap. To bring
  // back a ramp later, set e.g. steps=[...Array(30).fill(10), 20, 30, 45, 60].
  const steps = opts.steps ?? [10];
  const accelWindowMs = opts.accelWindowMs ?? 400;
  const commitMs = opts.commitMs ?? 500;

  let pending: number | null = null;
  let runLen = 0;
  let lastAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clamp = (t: number) => Math.min(opts.getLive(), Math.max(opts.getFloor(), t));
  const stepFor = (n: number) => steps[Math.min(n, steps.length - 1)]!;

  const clearTimer = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const arm = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      if (pending == null) return;
      const target = pending;
      pending = null;
      runLen = 0;
      // Leave the preview showing `target`; the caller drops it once the real position lands.
      opts.commit(target);
    }, commitMs);
  };

  return {
    scrub(direction) {
      const t = Date.now();
      runLen = t - lastAt < accelWindowMs ? runLen + 1 : 0;
      lastAt = t;
      const base = pending ?? opts.getPosition();
      pending = clamp(base + direction * stepFor(runLen));
      opts.onPreview(pending);
      arm();
    },
    flush() {
      clearTimer();
      if (pending == null) return;
      const target = pending;
      pending = null;
      runLen = 0;
      opts.commit(target);
    },
    cancel() {
      clearTimer();
      pending = null;
      runLen = 0;
      opts.onPreview(null);
    },
    isScrubbing() {
      return pending != null;
    },
  };
}
