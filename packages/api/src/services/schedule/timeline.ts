import { type BumperPlan, breakSeconds } from "../bumpers/bumper-config";
import type { PlexItem } from "../plex/client";
import type { FilterNode } from "../plex/filter-fields";
import { matchesLocalFilter } from "./local-filter";

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
  /** Tier-2 cross-pass history: the trailing emitted items feeding the CURRENT pass's `noRepeatWithin`
   *  constraint (pinned per pass, like `passSeed`; recomputed from the prior pass's tail at rollover). Absent
   *  for channels with no constraint — the pure per-pass strategies don't need it. */
  recent?: RecentItem[];
};

/** One trailing emitted item (its group key + duration) — the memory a `noRepeatWithin` constraint walks
 *  backward over to decide whether a group is still "too recent" to air again. */
export type RecentItem = { key: string; sec: number };

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

// ─────────────────────────────────────────────────────────────────────────────
// Channel strategies (§7.6 Arc 3) — OPTIONAL bolt-on grouping/rotation over the base
// `ordering`. A strategy is a smarter per-pass ordering: bucket the base-ordered pool
// into groups (by show/movie/collection), then either MARATHON each group in turn
// (`clustered`) or ROTATE a run of items per group (`round_robin`). The base ordering
// still governs the order WITHIN each group and how groups are sorted — so IN_ORDER
// continues a show across its blocks, SHUFFLE randomises within, etc.
//
// Every pass is still a full permutation of the pool (each item exactly once), so a
// strategy is a pure function of (pool, baseSeed, passIndex) and resumes on the existing
// {passSeed, passIndex, pos} cursor with NO new fields — the round-robin no-same-group-
// back-to-back rule is enforced WITHIN a pass (between laps), which is self-contained.
// (True cross-pass constraints — "no repeat within 6h" — are a later Tier-2 addition that
// carries history through the cursor; not here.)

/** What a grouping rule targets. `show` = one group per series; `movie` = all movies one group;
 *  `collection` = the whole filter-matched set as ONE group (a marathon carve-out — e.g. "Star Wars"). */
export type GroupScope = "show" | "movie" | "collection";
/** How much of a group plays per turn: a fixed count, a seeded count range, a seeded
 *  duration range (length-aware — short shows self-adjust), or the whole group. */
export type RunSpec = number | [number, number] | "all" | { minutes: [number, number] };
/** OPTIONAL predicate narrowing which pool items a rule claims — the SAME `FilterNode` tree as the channel
 *  content filter (the admin reuses that builder), but evaluated LOCALLY against cached pool metadata (no Plex
 *  query). Used for carve-outs like "the Star Wars films". See {@link matchesLocalFilter}. */
export type GroupingRule = { scope: GroupScope; run?: RunSpec; filter?: FilterNode };
export type ChannelStrategy = {
  rotation: "clustered" | "round_robin";
  /** round_robin only: reshuffle the group order each lap (`shuffle`) vs rotate the pattern (`cycle`). */
  rotationOrder?: "shuffle" | "cycle";
  grouping: GroupingRule[];
  constraints?: { noRepeatWithin?: { minutes?: number; count?: number } };
};

/** Validate an untyped `Channel.strategy` JSON into a usable strategy, or null (→ base ordering).
 *  Defensive: a malformed/empty strategy safely falls back so a channel is never broken by bad config. */
export function parseStrategy(raw: unknown): ChannelStrategy | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const rotation = s.rotation;
  if (rotation !== "clustered" && rotation !== "round_robin") return null;
  if (!Array.isArray(s.grouping) || s.grouping.length === 0) return null;
  const grouping: GroupingRule[] = [];
  for (const g of s.grouping) {
    if (!g || typeof g !== "object") continue;
    const scope = (g as Record<string, unknown>).scope;
    if (scope !== "show" && scope !== "movie" && scope !== "collection") continue;
    grouping.push({
      scope,
      run: (g as Record<string, unknown>).run as RunSpec | undefined,
      filter: (g as Record<string, unknown>).filter as FilterNode | undefined,
    });
  }
  if (grouping.length === 0) return null;
  const rotationOrder = s.rotationOrder === "cycle" ? "cycle" : "shuffle";
  return { rotation, rotationOrder, grouping, constraints: s.constraints as ChannelStrategy["constraints"] };
}

/** The group key + run for an item under these rules, or null → the item is its own singleton (run 1).
 *  FIRST matching rule wins (so a filtered carve-out listed first claims its items). A rule with a `filter`
 *  only claims items the filter matches. `collection` = the whole matched set as one group (marathon carve-out);
 *  `show` = per-series; `movie` = all movies in one group. */
function groupFor(item: PlexItem, rules: GroupingRule[]): { key: string; run: RunSpec } | null {
  for (let ri = 0; ri < rules.length; ri++) {
    const rule = rules[ri]!;
    if (rule.filter && !matchesLocalFilter(item, rule.filter)) continue;
    if (rule.scope === "collection") return { key: `collection:${ri}`, run: rule.run ?? "all" };
    if (rule.scope === "show") {
      if (item.guide.showRatingKey) return { key: `show:${item.guide.showRatingKey}`, run: rule.run ?? 1 };
      continue; // a show rule can't claim a movie — let a later rule try
    }
    if (rule.scope === "movie") {
      if (item.guide.type === "movie") return { key: "movie", run: rule.run ?? 1 };
      continue;
    }
  }
  return null;
}

/** How many items to take from a group this turn, seeded (deterministic). Always ≥1. Duration mode
 *  sums real item lengths so short-episode shows self-adjust (no per-show length classification). */
function runCount(items: PlexItem[], consumed: number, run: RunSpec | undefined, seed: number): number {
  const remaining = items.length - consumed;
  if (remaining <= 0) return 0;
  if (run === "all") return remaining;
  if (typeof run === "number") return Math.max(1, Math.min(remaining, Math.floor(run)));
  const rng = mulberry32(seed);
  if (Array.isArray(run)) {
    const [lo, hi] = run;
    const n = Math.floor(lo + rng() * (Math.max(lo, hi) - lo + 1));
    return Math.max(1, Math.min(remaining, n));
  }
  if (run && typeof run === "object" && Array.isArray(run.minutes)) {
    // Fill a block toward the [lo, hi]-minute window WITHOUT overshooting the ceiling: add items while
    // each still fits under `hi`, and stop as soon as we're within the window. So a 22-min show in a
    // 24–30 window is ONE item (a 2nd would be 44 > 30), while 7-min episodes pack in until they reach it.
    // Always ≥1 (a single item longer than the window still airs once).
    const [lo, hi] = run.minutes;
    const loSec = Math.min(lo, hi) * 60;
    const hiSec = Math.max(lo, hi) * 60;
    let acc = 0;
    let count = 0;
    for (let i = consumed; i < items.length; i++) {
      const s = itemSeconds(items[i]!);
      if (count > 0 && acc + s > hiSec) break; // adding this would blow past the ceiling
      acc += s;
      count++;
      if (acc >= loSec) break; // reached the window — good enough
    }
    return Math.max(1, count);
  }
  return 1;
}

/** Seeded Fisher–Yates over a copy of an index array. */
function shuffleIndices(idx: number[], seed: number): number[] {
  const arr = [...idx];
  const rng = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
  return arr;
}

type StrategyGroup = { key: string; items: PlexItem[]; run: RunSpec | undefined; firstIdx: number };

/** The group key for an item (matching the bucketing in `strategyPassOrder`). */
function keyOf(item: PlexItem, rules: GroupingRule[]): string {
  const g = groupFor(item, rules);
  return g ? g.key : `solo:${item.ratingKey}`;
}

/**
 * One pass under a strategy: a full permutation of the pool. Buckets the base-ordered pool
 * into groups, then assembles by rotation. Pure in (pool, ordering, strategy, baseSeed, passIndex)
 * — plus `incoming` (the cross-pass history) ONLY when a `noRepeatWithin` constraint is active.
 */
function strategyPassOrder(
  pool: PlexItem[],
  ordering: OrderingStrategy,
  strategy: ChannelStrategy,
  baseSeed: number,
  passIndex: number,
  incoming: RecentItem[] = [],
): PlexItem[] {
  const based = passOrder(pool, ordering, baseSeed, passIndex);
  const map = new Map<string, StrategyGroup>();
  based.forEach((item, idx) => {
    const g = groupFor(item, strategy.grouping);
    const key = g ? g.key : `solo:${item.ratingKey}`;
    const run = g ? g.run : 1;
    const existing = map.get(key);
    if (existing) existing.items.push(item);
    else map.set(key, { key, items: [item], run, firstIdx: idx });
  });
  // Group order follows the base ordering (position of each group's first item).
  const groups = [...map.values()].sort((a, b) => a.firstIdx - b.firstIdx);

  // Tier-2: a cross-pass "no repeat within N minutes/items" constraint → starvation-based assembly.
  const nr = strategy.constraints?.noRepeatWithin;
  if (nr && (nr.minutes != null || nr.count != null)) {
    return constrainedPassOrder(groups, nr, baseSeed, passIndex, incoming);
  }

  // Marathon: each group's whole run, in group order.
  if (strategy.rotation === "clustered") return groups.flatMap((g) => g.items);

  // Rotate: a seeded run per group per lap, never the same group back-to-back across a lap seam.
  const out: PlexItem[] = [];
  const consumed = groups.map(() => 0);
  const hasMore = (i: number) => consumed[i]! < groups[i]!.items.length;
  let lap = 0;
  let lastGroup = -1;
  while (groups.some((_, i) => hasMore(i))) {
    const before = out.length;
    const active = groups.map((_, i) => i).filter(hasMore);
    const lapSeed = mix(mix(baseSeed >>> 0, passIndex), lap);
    let lapOrder =
      strategy.rotationOrder === "cycle"
        ? // rotate the active list left by `lap`
          active.slice(lap % active.length).concat(active.slice(0, lap % active.length))
        : shuffleIndices(active, lapSeed);
    // No same group back-to-back at the lap seam (unless it's the only one left).
    if (lapOrder.length > 1 && lapOrder[0] === lastGroup) {
      const t = lapOrder[0]!;
      lapOrder[0] = lapOrder[1]!;
      lapOrder[1] = t;
    }
    for (const gi of lapOrder) {
      if (!hasMore(gi)) continue;
      const g = groups[gi]!;
      const take = runCount(g.items, consumed[gi]!, g.run, mix(lapSeed, gi));
      for (let k = 0; k < take && hasMore(gi); k++) out.push(g.items[consumed[gi]!++]!);
      lastGroup = gi;
    }
    lap++;
    if (out.length === before) break; // safety: never spin without progress
  }
  return out;
}

/**
 * Tier-2 assembly: honor a `noRepeatWithin` window (minutes and/or item count). A **starvation scheduler** —
 * each turn picks, among groups not currently inside their no-repeat window (and never the immediately-previous
 * group), the one aired longest ago; seeded tiebreak. If EVERY remaining group is still inside its window
 * (tiny pool), it **relaxes** to the least-recently-aired one rather than stalling — so every item is still laid
 * exactly once. `incoming` seeds the per-group "last aired" from the previous pass's tail, so the constraint
 * holds across a build seam. Deterministic in (groups, nr, baseSeed, passIndex, incoming).
 */
function constrainedPassOrder(
  groups: StrategyGroup[],
  nr: { minutes?: number; count?: number },
  baseSeed: number,
  passIndex: number,
  incoming: RecentItem[],
): PlexItem[] {
  const wSec = nr.minutes != null ? nr.minutes * 60 : 0;
  const wCount = nr.count != null ? nr.count : 0;
  const consumed = groups.map(() => 0);
  const hasMore = (i: number) => consumed[i]! < groups[i]!.items.length;

  // Seed each group's most-recent end position (sec + item index) from the incoming tail. Entries end at
  // pass start (position 0), so pre-pass ends are negative (how long ago, backward from 0).
  const lastSec = new Map<string, number>();
  const lastIdx = new Map<string, number>();
  {
    let accSec = 0;
    let accIdx = 0;
    for (let i = incoming.length - 1; i >= 0; i--) {
      const e = incoming[i]!;
      if (!lastSec.has(e.key)) {
        lastSec.set(e.key, -accSec);
        lastIdx.set(e.key, -accIdx);
      }
      accSec += e.sec;
      accIdx += 1;
    }
  }

  const out: PlexItem[] = [];
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  let posSec = 0;
  let posIdx = 0;
  let lastGroup = -1;
  let turn = 0;
  while (out.length < total) {
    const before = out.length;
    const remaining = groups.map((_, i) => i).filter(hasMore);
    if (remaining.length === 0) break;
    // Avoid the immediately-previous group unless it's the only one left.
    const notLast = remaining.filter((i) => i !== lastGroup);
    const pool = notLast.length ? notLast : remaining;
    const gapSec = (i: number) => posSec - (lastSec.get(groups[i]!.key) ?? -Infinity);
    const gapIdx = (i: number) => posIdx - (lastIdx.get(groups[i]!.key) ?? -Infinity);
    const eligible = pool.filter((i) => gapSec(i) >= wSec && gapIdx(i) >= wCount);
    const candidates = eligible.length ? eligible : pool; // relax if none clears the window
    // Most-starved first (aired longest ago); seeded tiebreak so ties are deterministic + varied.
    const tb = (i: number) => mulberry32(mix(mix(baseSeed >>> 0, passIndex), turn * 131 + i))();
    const pick = candidates.sort((a, b) => gapSec(b) - gapSec(a) || tb(a) - tb(b))[0]!;

    const g = groups[pick]!;
    const take = runCount(g.items, consumed[pick]!, g.run, mix(mix(baseSeed >>> 0, passIndex), turn));
    for (let k = 0; k < take && hasMore(pick); k++) {
      const it = g.items[consumed[pick]!++]!;
      out.push(it);
      posSec += itemSeconds(it);
      posIdx += 1;
    }
    lastSec.set(g.key, posSec);
    lastIdx.set(g.key, posIdx);
    lastGroup = pick;
    turn++;
    if (out.length === before) break; // safety
  }
  return out;
}

/** The trailing emitted items of a pass, enough to cover the largest `noRepeatWithin` window — persisted as the
 *  next pass's `incoming` so the constraint holds across the pass boundary. Bounded to avoid unbounded JSON. */
function tailRecent(
  order: PlexItem[],
  rules: GroupingRule[],
  nr: { minutes?: number; count?: number },
): RecentItem[] {
  const wSec = nr.minutes != null ? nr.minutes * 60 : 0;
  const wCount = nr.count != null ? nr.count : 0;
  const res: RecentItem[] = [];
  let sec = 0;
  let cnt = 0;
  for (let i = order.length - 1; i >= 0 && cnt < 1000; i--) {
    const it = order[i]!;
    res.unshift({ key: keyOf(it, rules), sec: itemSeconds(it) });
    sec += itemSeconds(it);
    cnt += 1;
    if (sec >= wSec && cnt >= wCount) break; // both windows covered
  }
  return res;
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
  opts: {
    maxDurationSeconds?: number;
    resumeFrom?: ScheduleCursor | null;
    /** OPTIONAL bolt-on grouping/rotation (§7.6 Arc 3). null/undefined = base ordering only. */
    strategy?: ChannelStrategy | null;
  } = {},
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

  const strategy = opts.strategy ?? null;
  const constraint = strategy?.constraints?.noRepeatWithin ?? null;
  // Tier-2 incoming cross-pass history for the CURRENT pass — pinned per pass (like passSeed), recomputed from
  // the prior pass's tail at rollover, so a `noRepeatWithin` constraint holds across a windowed build seam.
  let recent: RecentItem[] = constraint && resume?.recent ? resume.recent : [];
  while (!stopped && coveredSeconds < target && entries.length < MAX_ENTRIES) {
    const order = strategy
      ? strategyPassOrder(usable, ordering, strategy, baseSeed, passIndex, recent)
      : passOrder(usable, ordering, baseSeed, passIndex);
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
      // Carry the tail forward so a constraint spans the pass boundary.
      if (constraint) recent = tailRecent(order, strategy!.grouping, constraint);
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
    cursor: { passSeed: baseSeed, passIndex, pos, ...(constraint ? { recent } : {}) },
  };
}
