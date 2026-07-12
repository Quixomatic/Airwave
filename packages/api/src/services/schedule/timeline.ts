import type { PlexItem } from "../plex/client";

export type OrderingStrategy = "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";

/** One materialized slot on a channel's timeline. Display metadata is joined via MediaItem. */
export type TimelineEntry = {
  ratingKey: string;
  startsAt: Date;
  durationSeconds: number;
  startOffsetSeconds: number;
};

export type BuildResult = {
  entries: TimelineEntry[];
  /** How many full passes of the pool were laid down. */
  passes: number;
  /** Duration of one full pass of the pool (seconds). */
  poolSeconds: number;
  /** Total scheduled duration produced (seconds). */
  coveredSeconds: number;
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
 * Lay out a channel's lineup back-to-back from `startAt`. Always produces at least
 * one **full pass** of the pool (so every item is scheduled), then keeps appending
 * whole passes — each reshuffled for SHUFFLE channels — until it has covered
 * `minDurationSeconds`. So a 20-day movie pool yields one 20-day pass; a 3-hour pool
 * loops until it fills the floor. Absolute `startsAt` times come from `startAt`.
 */
export function buildSchedule(
  pool: PlexItem[],
  ordering: OrderingStrategy,
  seed: number,
  startAt: Date,
  minDurationSeconds: number,
): BuildResult {
  const usable = pool.filter((i) => i.durationMs > 0);
  if (usable.length === 0) return { entries: [], passes: 0, poolSeconds: 0, coveredSeconds: 0 };

  const poolSeconds = usable.reduce((s, i) => s + itemSeconds(i), 0);
  // Fold the block's start time into the seed so an appended block (or a rebuild at a
  // different time) reshuffles differently, while staying deterministic.
  const baseSeed = mix(seed >>> 0, Math.floor(startAt.getTime() / 1000) >>> 0);

  const entries: TimelineEntry[] = [];
  let cursorSec = Math.floor(startAt.getTime() / 1000);
  let coveredSeconds = 0;
  let passes = 0;

  while (coveredSeconds < minDurationSeconds && entries.length < MAX_ENTRIES) {
    const order = passOrder(usable, ordering, baseSeed, passes);
    for (const item of order) {
      const dur = itemSeconds(item);
      entries.push({
        ratingKey: item.ratingKey,
        startsAt: new Date(cursorSec * 1000),
        durationSeconds: dur,
        startOffsetSeconds: 0,
      });
      cursorSec += dur;
      coveredSeconds += dur;
      if (entries.length >= MAX_ENTRIES) break;
    }
    passes++;
  }

  return { entries, passes, poolSeconds, coveredSeconds };
}
