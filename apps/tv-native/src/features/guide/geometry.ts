import type { GuideGridProgram } from "@/lib/api";

/**
 * The Aurora guide's time/space geometry as pure functions: where the timeline starts, where a program's cell
 * sits in the lane, whether it is drawn at all, how much of it has aired, and what size of artwork to ask for.
 *
 * No react-native imports, so `bun test` can load it. It is also the contract the native guide renderer is
 * checked against (packages/native-guide/scripts/gen-geometry-fixture.ts turns these functions' results into a
 * fixture). The grid's two cull sites, the per-channel filter (`isVisible`) and each Row (`cellBox`), are both built
 * on `cellBox`, so they can only differ in the gap they pass: see SOURCE_CULL_GAP.
 */

export const MIN = 60_000; // ms per minute
export const WINDOW_MIN = 180; // minutes of timeline across the lane
export const LEAD_MIN = 30; // minutes of "already aired" shown before the grid start
/** A program never gets less than this fraction of the lane's width, so a very short one still gets a cell. */
export const MIN_CELL_FRAC = 0.02;
/** Cells narrower than this many dp (after the gap and the rail clamp) are skipped: they'd only be slivers. */
export const MIN_CELL_W = 8;
/**
 * The gap, in dp, the per-channel program filter culls with: the 6 it has always used, not the chrome-scaled `lane.gap`
 * the Rows place their cells with (3 on Android TV, whose layout space is ~960 dp; 6 elsewhere). So on Android TV a
 * program clamped at the rail edge with 14-20 dp of it left is dropped by the filter, though a Row would have drawn it as
 * an 8-14 dp cell. That is kept as it was: this change moves the arithmetic without changing what the guide shows.
 */
export const SOURCE_CULL_GAP = 6;

type Timed = Pick<GuideGridProgram, "startsAt" | "durationSeconds">;

/**
 * The lane's coordinate system. `T0` is the timeline start, `ppm` the dp per minute, `laneW` the lane's width in
 * dp, and `gap` the dp left between adjacent cells (chrome-scaled by the caller: raw dp read ~2x too wide on
 * Android TV's 960 dp layout space).
 */
export type Lane = { T0: Date; ppm: number; laneW: number; gap: number };
export type CellBox = { left: number; width: number };

/**
 * The grid's start: `now` minus LEAD_MIN, snapped back to the latest :01 or :31 mark at or before it (local
 * time). So :31..:59 lands on :31, :01..:30 on :01 of the same hour, and exactly :00 on :31 of the hour before.
 */
export function timelineOrigin(now: Date): Date {
  const d = new Date(now.getTime() - LEAD_MIN * MIN);
  const m = d.getMinutes();
  d.setMinutes(m >= 31 ? 31 : m >= 1 ? 1 : -29, 0, 0);
  return d;
}

/**
 * Where a program's cell sits in the lane (dp from the lane's left edge), or null when it isn't drawn: it ended
 * before the rail, starts past the window, or is narrower than MIN_CELL_W once the gap is taken off. A program
 * that began before the rail is clamped to start at `gap`, so the cell keeps a margin against the rail.
 */
export function cellBox(program: Timed, { T0, ppm, laneW, gap }: Lane): CellBox | null {
  const startMin = (new Date(program.startsAt).getTime() - T0.getTime()) / MIN;
  const durMin = program.durationSeconds / 60;
  if (!(startMin + durMin > 0 && startMin < WINDOW_MIN)) return null;
  const rawLeft = startMin * ppm;
  const rawRight = rawLeft + Math.max(laneW * MIN_CELL_FRAC, durMin * ppm) - gap;
  const left = rawLeft < 0 ? gap : rawLeft;
  const width = rawRight - left;
  return width < MIN_CELL_W ? null : { left, width };
}

/**
 * Whether the per-channel filter keeps a program: `cellBox` at SOURCE_CULL_GAP, whatever `lane.gap` is. A program it keeps
 * always gets a cell in its Row, since `lane.gap` is never above SOURCE_CULL_GAP and a smaller gap only widens a cell.
 */
export const isVisible = (program: Timed, lane: Lane): boolean => cellBox(program, { ...lane, gap: SOURCE_CULL_GAP }) !== null;

/**
 * How much of a cell has aired, 0..1: where "now" falls inside the cell. `nowX` is now's position in the lane
 * (dp, the same space as the cell's `left`).
 */
export const liveFill = (nowX: number, left: number, width: number): number => Math.max(0, Math.min(1, (nowX - left) / width));

/** Index of the program airing at `nowMs` (else 0) — the "on now" slot. */
export function liveProgramIndex(programs: Timed[], nowMs: number): number {
  const i = programs.findIndex((p) => {
    const s = new Date(p.startsAt).getTime();
    return nowMs >= s && nowMs < s + p.durationSeconds * 1000;
  });
  return i >= 0 ? i : 0;
}

/** Artwork sizes are rounded up to this many px, so near-identical cells share one image URL (and cache entry). */
export const ART_STEP = 64;
/** The image route clamps `w` and `h` to 2000 px; this is the largest bucket under that. */
export const ART_MAX = 1920;

/**
 * The pixel size to request artwork at for a cell drawn `widthDp` x `heightDp`: the drawn size, rounded up to a
 * whole `step` so it is never softer than drawn, and capped at ART_MAX.
 */
export function artBox(widthDp: number, heightDp: number, pixelRatio: number, step = ART_STEP): { w: number; h: number } {
  const up = (dp: number) => Math.min(ART_MAX, Math.ceil(Math.max(1, Math.ceil(dp * pixelRatio)) / step) * step);
  return { w: up(widthDp), h: up(heightDp) };
}
