import { type BumperPlan, breakSeconds } from "../bumpers/bumper-config";
import type { PlexItem } from "../plex/client";

export type OrderingStrategy = "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";

/** The break plan woven between programs (null = no bumpers on this channel). The
 *  interstitial length is chosen per transition — see {@link breakSeconds}. */
export type TimelineBumperPlan = BumperPlan;

/** One materialized slot on a channel's timeline. Display metadata is joined via MediaItem. */
export type TimelineEntry = {
  kind: "PROGRAM" | "BUMPER";
  /** The media to play. Null for interstitial bumpers (the client renders them). */
  ratingKey: string | null;
  /** For a bumper: which kind ("interstitial"). Null for programs. */
  bumperKind: string | null;
  /** For a bumper: the ratingKey of the upcoming program it introduces. */
  targetRatingKey: string | null;
  startsAt: Date;
  durationSeconds: number;
  startOffsetSeconds: number;
};

/**
 * Where a build stopped, so the next one can carry on mid-pass instead of restarting
 * the pool from the top. Only meaningful when a build was capped (`maxDurationSeconds`);
 * an uncapped build always ends on a clean pass boundary (`pos: 0`).
 *
 * `passSeed` pins the seed of the in-progress pass sequence: `buildSchedule` normally
 * folds `startAt` into the seed, so without pinning it a resumed build would reshuffle
 * mid-pass and the remainder wouldn't line up with the head already on the timeline.
 */
export type ScheduleCursor = {
  /** Base seed of the pass sequence in progress. */
  passSeed: number;
  /** Which pass of the pool we're in (feeds the per-pass reshuffle). */
  passIndex: number;
  /** Next item offset within that pass's order. 0 = start of a fresh pass. */
  pos: number;
};

export type BuildResult = {
  entries: TimelineEntry[];
  /** How many full passes of the pool were laid down (a truncated pass doesn't count). */
  passes: number;
  /** Duration of one full pass of the pool (seconds), programs only. */
  poolSeconds: number;
  /** Total scheduled duration produced (seconds), including bumpers. */
  coveredSeconds: number;
  /** How many interstitial/bumper slots were woven in. */
  bumperCount: number;
  /** Where to resume — persist this and hand it back via `resumeFrom`. */
  cursor: ScheduleCursor;
};

/** Items shorter than this are treated as this long, so a pass can never be zero-length. */
const MIN_ITEM_SECONDS = 1;
/** Runaway guard: a tiny pool against a huge floor could otherwise loop forever. */
const MAX_ENTRIES = 20000;

/** Mulberry32 — a small, fast, fully deterministic PRNG (seed in → same stream out). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministically combine two 32-bit values into a new seed. */
function mix(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b >>> 0), 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

function itemSeconds(i: PlexItem): number {
  return Math.max(MIN_ITEM_SECONDS, Math.round(i.durationMs / 1000));
}

/** A stable base order (ratingKey ascending) so a shuffle never depends on Plex's return order. */
function stableBase(pool: PlexItem[]): PlexItem[] {
  return [...pool].sort((a, b) => a.ratingKey.localeCompare(b.ratingKey, undefined, { numeric: true }));
}

/** Seeded Fisher–Yates over the stable base. */
function seededShuffle(pool: PlexItem[], seed: number): PlexItem[] {
  const arr = stableBase(pool);
  const rng = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

/**
 * The item order for one pass. SHUFFLE reshuffles per pass (seeded); any other
 * ordering preserves the pool's incoming order — which is Plex's sort (year, rating,
 * date added, …), applied at resolve time.
 */
function passOrder(
  pool: PlexItem[],
  ordering: OrderingStrategy,
  baseSeed: number,
  passIndex: number,
): PlexItem[] {
  if (ordering === "SHUFFLE") return seededShuffle(pool, mix(baseSeed, passIndex));
  return pool;
}

/**
 * Lay out a channel's lineup back-to-back from `startAt`.
 *
 * **Default (uncapped) — unchanged behaviour.** Always produces at least one **full
 * pass** of the pool (so every item is scheduled), then keeps appending whole passes —
 * each reshuffled for SHUFFLE channels — until it has covered `minDurationSeconds`. So
 * a 20-day movie pool yields one 20-day pass; a 3-hour pool loops until it fills the
 * floor. This is what a "rebuild the whole schedule" action wants.
 *
 * **Windowed (`opts.maxDurationSeconds`).** Stops as soon as that much is covered, and
 * will break **mid-pass** to do it — so a huge pool can be given a cheap 12h head start
 * instead of a 300-day build. The cap doubles as the target: a short pool still loops
 * passes until it fills the window. Because a capped build can stop mid-pass, it returns
 * a {@link ScheduleCursor}; hand that back as `opts.resumeFrom` on the next build and it
 * carries on from that exact item rather than restarting the pool from the top (which
 * would make an IN_ORDER channel loop its first N hours forever). When a resumed build
 * runs off the end of a pass it rolls over cleanly: `passIndex + 1`, `pos` back to 0,
 * and SHUFFLE channels get a fresh reshuffle for the new pass.
 *
 * When `bumper` is set, an interstitial break is woven in **before each program**
 * (except the very first slot of the build, so a mid-stream tune-in isn't preceded
 * by a break) — the interstitial targets the program that follows it.
 */
export function buildSchedule(
  pool: PlexItem[],
  ordering: OrderingStrategy,
  seed: number,
  startAt: Date,
  minDurationSeconds: number,
  bumper: TimelineBumperPlan | null = null,
  opts: { maxDurationSeconds?: number; resumeFrom?: ScheduleCursor | null } = {},
): BuildResult {
  const usable = pool.filter((i) => i.durationMs > 0);
  const resume = opts.resumeFrom ?? null;
  // Fold the block's start time into the seed so an appended block (or a rebuild at a
  // different time) reshuffles differently, while staying deterministic. A resumed build
  // instead reuses the pinned seed of the pass it's continuing.
  const baseSeed = resume
    ? resume.passSeed >>> 0
    : mix(seed >>> 0, Math.floor(startAt.getTime() / 1000) >>> 0);

  if (usable.length === 0)
    return {
      entries: [],
      passes: 0,
      poolSeconds: 0,
      coveredSeconds: 0,
      bumperCount: 0,
      cursor: { passSeed: baseSeed, passIndex: 0, pos: 0 },
    };

  const poolSeconds = usable.reduce((s, i) => s + itemSeconds(i), 0);
  const cap = opts.maxDurationSeconds ?? null;
  // A window cap is also the target — a short pool loops passes until it fills the window.
  const target = cap ?? minDurationSeconds;

  let passIndex = resume ? resume.passIndex : 0;
  let pos = resume ? resume.pos : 0;
  // A stale cursor (the pool shrank since it was written, e.g. the filter was edited)
  // can point past the end — roll to a clean fresh pass rather than laying nothing.
  if (pos < 0 || pos >= usable.length) {
    passIndex++;
    pos = 0;
  }

  const entries: TimelineEntry[] = [];
  let cursorSec = Math.floor(startAt.getTime() / 1000);
  let coveredSeconds = 0;
  let passes = 0;
  let bumperCount = 0;
  // The program laid just before the current one — the "outgoing" side of a break.
  let prevItem: PlexItem | null = null;
  let stopped = false;

  while (!stopped && coveredSeconds < target && entries.length < MAX_ENTRIES) {
    const order = passOrder(usable, ordering, baseSeed, passIndex);
    let i = pos;
    while (i < order.length) {
      // Windowed builds stop the moment the window is covered — mid-pass is the point.
      if (cap != null && coveredSeconds >= cap) {
        stopped = true;
        break;
      }
      if (entries.length >= MAX_ENTRIES) {
        stopped = true;
        break;
      }
      const item = order[i]!;

      // Interstitial break introducing this program (never before the very first slot).
      // Length is contextual — a function of the outgoing (prevItem) → incoming (item) pair.
      if (bumper && prevItem) {
        const bumperSeconds = Math.max(1, Math.round(breakSeconds(prevItem, item, bumper)));
        entries.push({
          kind: "BUMPER",
          ratingKey: null,
          bumperKind: "interstitial",
          targetRatingKey: item.ratingKey,
          startsAt: new Date(cursorSec * 1000),
          durationSeconds: bumperSeconds,
          startOffsetSeconds: 0,
        });
        cursorSec += bumperSeconds;
        coveredSeconds += bumperSeconds;
        bumperCount++;
      }

      const dur = itemSeconds(item);
      entries.push({
        kind: "PROGRAM",
        ratingKey: item.ratingKey,
        bumperKind: null,
        targetRatingKey: null,
        startsAt: new Date(cursorSec * 1000),
        durationSeconds: dur,
        startOffsetSeconds: 0,
      });
      cursorSec += dur;
      coveredSeconds += dur;
      prevItem = item;
      i++;
    }

    if (stopped) {
      // Truncated mid-pass — resume at exactly the item we didn't lay.
      pos = i;
    } else {
      // Ran the pass to completion: roll over to a brand-new pass from 0 (SHUFFLE
      // reshuffles on the new passIndex), which is also how an uncapped build loops.
      passIndex++;
      pos = 0;
      passes++;
    }
  }

  return {
    entries,
    passes,
    poolSeconds,
    coveredSeconds,
    bumperCount,
    cursor: { passSeed: baseSeed, passIndex, pos },
  };
}
