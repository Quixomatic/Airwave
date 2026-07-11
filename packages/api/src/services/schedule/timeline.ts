import type { PlexItem } from "../plex/client";

export type OrderingStrategy = "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";

/** One materialized slot on a channel's timeline. */
export type TimelineEntry = {
  ratingKey: string;
  title: string;
  startsAt: Date;
  durationSeconds: number;
  startOffsetSeconds: number;
};

/** Items shorter than this are treated as this long, so the loop can never stall. */
const MIN_ITEM_SECONDS = 1;
/** Runaway guard for a single materialization pass (tiny loop over a huge horizon). */
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

function itemSeconds(i: PlexItem): number {
  return Math.max(MIN_ITEM_SECONDS, Math.round(i.durationMs / 1000));
}

/** Sortable air-date key; unknown dates sort last. */
function airKey(i: PlexItem): string {
  if (i.originallyAvailableAt) return i.originallyAvailableAt;
  if (i.year) return `${i.year}-00-00`;
  return "9999-99-99";
}

/**
 * Deterministic ordering of the pool. Always derived from a stable base
 * (ratingKey ascending) so the sequence depends only on (pool, ordering, seed) —
 * never on the order Plex happened to return items in.
 */
export function orderPool(pool: PlexItem[], ordering: OrderingStrategy, seed: number): PlexItem[] {
  const base = [...pool].sort((a, b) =>
    a.ratingKey.localeCompare(b.ratingKey, undefined, { numeric: true }),
  );

  if (ordering === "IN_ORDER") {
    return base.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (ordering === "BY_AIR_DATE") {
    return base.sort((a, b) => airKey(a).localeCompare(airKey(b)) || a.title.localeCompare(b.title));
  }

  // SHUFFLE — seeded Fisher–Yates over the stable base.
  const rng = mulberry32(seed);
  for (let i = base.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = base[i]!;
    base[i] = base[j]!;
    base[j] = tmp;
  }
  return base;
}

type Loop = {
  ordered: PlexItem[];
  durations: number[];
  /** Absolute second at which each item starts within one loop pass. */
  cumulative: number[];
  loopSeconds: number;
};

function buildLoop(pool: PlexItem[], ordering: OrderingStrategy, seed: number): Loop {
  const ordered = orderPool(pool, ordering, seed).filter((i) => i.durationMs > 0);
  const durations = ordered.map(itemSeconds);
  const cumulative: number[] = [];
  let acc = 0;
  for (const d of durations) {
    cumulative.push(acc);
    acc += d;
  }
  return { ordered, durations, cumulative, loopSeconds: acc };
}

/**
 * The item playing at absolute second `t`, and the absolute second it started at.
 * `elapsed` wraps within the loop (handles t before the anchor too).
 */
function positionAt(loop: Loop, anchorSec: number, t: number): { index: number; itemStartSec: number } {
  const { loopSeconds, cumulative } = loop;
  const elapsed = (((t - anchorSec) % loopSeconds) + loopSeconds) % loopSeconds;
  let lo = 0;
  let hi = cumulative.length - 1;
  let idx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= elapsed) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { index: idx, itemStartSec: t - (elapsed - cumulative[idx]!) };
}

/**
 * Materialize the continuous, back-to-back timeline covering [from, to).
 * The first entry is the item already playing at `from` (its `startsAt` may be
 * slightly before `from`), so "what's on now" always resolves cleanly.
 */
export function buildTimeline(
  pool: PlexItem[],
  ordering: OrderingStrategy,
  seed: number,
  anchor: Date,
  from: Date,
  to: Date,
): { entries: TimelineEntry[]; loopSeconds: number } {
  const loop = buildLoop(pool, ordering, seed);
  if (loop.ordered.length === 0 || loop.loopSeconds === 0) return { entries: [], loopSeconds: 0 };

  const anchorSec = Math.floor(anchor.getTime() / 1000);
  const fromSec = Math.floor(from.getTime() / 1000);
  const toSec = Math.floor(to.getTime() / 1000);

  const start = positionAt(loop, anchorSec, fromSec);
  const entries: TimelineEntry[] = [];
  let idx = start.index;
  let itemStartSec = start.itemStartSec;

  while (itemStartSec < toSec && entries.length < MAX_ENTRIES) {
    const item = loop.ordered[idx]!;
    entries.push({
      ratingKey: item.ratingKey,
      title: item.title,
      startsAt: new Date(itemStartSec * 1000),
      durationSeconds: loop.durations[idx]!,
      startOffsetSeconds: 0,
    });
    itemStartSec += loop.durations[idx]!;
    idx = (idx + 1) % loop.ordered.length;
  }

  return { entries, loopSeconds: loop.loopSeconds };
}
