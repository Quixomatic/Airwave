import type { PrismaClient } from "@ChannelGuide/db";

import type { GuideMeta } from "../plex/client";
import { getGlobalBumperConfig, resolveBumperPlan } from "../bumpers/bumper-config";
import {
  guideMetaOf,
  guideMetaOfTarget,
  mediaItemGuideInclude,
  upsertPoolItems,
} from "../media/media-item";
import { resolveChannel } from "../plex/resolve";
import {
  type BuildResult,
  type OrderingStrategy,
  type ScheduleCursor,
  buildSchedule,
  parseStrategy,
} from "./timeline";

const DAY_SECONDS = 86400;
/**
 * Default window for a "get this channel watchable fast" build. A full build lays one
 * complete pass of the pool — for a 2,800-episode channel that's ~300 days and far too
 * slow to run inline at channel-creation time. A windowed build stops at ~12h; the
 * hourly `schedule-refresh` job grows it from there via {@link extendChannelSchedule}.
 */
export const INITIAL_WINDOW_SECONDS = 12 * 3600;
/**
 * Floor for a build block. A pool whose single pass is longer than this (e.g. a
 * few hundred movies) schedules exactly one full pass; a short pool loops
 * (reshuffling each pass) until it covers this much.
 */
const DEFAULT_MIN_HORIZON_SECONDS = 7 * DAY_SECONDS;
/** Extend the tail once it is within this much of "now". */
const DEFAULT_EXTEND_THRESHOLD_SECONDS = 2 * DAY_SECONDS;
/** Keep a little played-out history, then prune. */
const HISTORY_KEEP_SECONDS = 6 * 3600;

/**
 * Deterministic FNV-1a hash of the channel id — a stable fallback shuffle seed.
 * Returned as a **signed** 32-bit int so it fits Postgres `Int` (`shuffleSeed`);
 * the PRNG re-normalizes with `>>> 0` at use, so the sign doesn't matter.
 */
function deriveSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

async function ensureSeed(prisma: PrismaClient, channelId: string, current: number | null) {
  if (current != null) return current;
  const seed = deriveSeed(channelId);
  await prisma.channel.update({ where: { id: channelId }, data: { shuffleSeed: seed } });
  return seed;
}

function toRows(channelId: string, build: BuildResult, itemIds: Map<string, string>) {
  return build.entries.map((e) => ({
    channelId,
    kind: e.kind,
    startsAt: e.startsAt,
    durationSeconds: e.durationSeconds,
    startOffsetSeconds: e.startOffsetSeconds,
    ratingKey: e.ratingKey,
    bumperKind: e.bumperKind,
    // A program links to its own MediaItem; a bumper links to the upcoming program
    // it introduces via `targetMediaItemId` (for the "Up Next" art/metadata).
    mediaItemId: e.ratingKey ? (itemIds.get(e.ratingKey) ?? null) : null,
    targetMediaItemId: e.targetRatingKey ? (itemIds.get(e.targetRatingKey) ?? null) : null,
  }));
}

export type ScheduleSummary = {
  channelId: string;
  poolSize: number;
  itemCount: number;
  /** Program slots (itemCount minus bumpers). */
  programCount: number;
  bumperCount: number;
  passes: number;
  poolSeconds: number;
  coveredSeconds: number;
  startsAt: Date;
  endsAt: Date;
};

function summarize(
  channelId: string,
  poolSize: number,
  build: BuildResult,
  from: Date,
): ScheduleSummary {
  const last = build.entries[build.entries.length - 1];
  return {
    channelId,
    poolSize,
    itemCount: build.entries.length,
    programCount: build.entries.length - build.bumperCount,
    bumperCount: build.bumperCount,
    passes: build.passes,
    poolSeconds: build.poolSeconds,
    coveredSeconds: build.coveredSeconds,
    startsAt: from,
    endsAt: last ? new Date(last.startsAt.getTime() + last.durationSeconds * 1000) : from,
  };
}

/** Persist where a build stopped (see {@link ScheduleCursor}). */
function cursorData(cursor: ScheduleCursor) {
  return {
    // Postgres Int is signed 32-bit; the seed is an unsigned hash — store it signed.
    schedulePassSeed: cursor.passSeed | 0,
    schedulePassIndex: cursor.passIndex,
    schedulePassPos: cursor.pos,
  };
}

/** Read a channel's stored cursor, or null when it's at a clean pass boundary. */
function cursorOf(channel: {
  schedulePassSeed: number;
  schedulePassIndex: number;
  schedulePassPos: number;
}): ScheduleCursor | null {
  // pos 0 with no pass history = nothing partial to resume; let the builder seed fresh.
  if (channel.schedulePassPos === 0 && channel.schedulePassIndex === 0) return null;
  return {
    passSeed: channel.schedulePassSeed >>> 0,
    passIndex: channel.schedulePassIndex,
    pos: channel.schedulePassPos,
  };
}

/**
 * Build the channel's lineup fresh from `now` and replace the timeline. Use after the
 * filter/pool changes (it necessarily disturbs what's on now). For a channel that's
 * just running low, prefer {@link extendChannelSchedule}.
 *
 * **Default: a FULL build** — one complete pass of the pool (every item scheduled),
 * looping to the 7-day floor for short pools. That's what the admin's "Generate
 * schedule" action wants after a filter edit.
 *
 * **`windowSeconds`: a capped build** — stop at roughly that much, breaking mid-pass if
 * needed, and record a cursor so `extend` carries on from that exact item. Use it to
 * make a new channel watchable immediately (see {@link INITIAL_WINDOW_SECONDS}) without
 * paying for a 300-day pass up front.
 */
export async function generateChannelSchedule(
  prisma: PrismaClient,
  channelId: string,
  opts: { from?: Date; minDurationSeconds?: number; windowSeconds?: number } = {},
): Promise<ScheduleSummary> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const from = opts.from ?? new Date();
  const min = opts.minDurationSeconds ?? DEFAULT_MIN_HORIZON_SECONDS;
  const seed = await ensureSeed(prisma, channelId, channel.shuffleSeed);

  const pool = await resolveChannel(prisma, channelId);
  const itemIds = await upsertPoolItems(prisma, channel.mediaSourceId, pool);
  const globalBumper = await getGlobalBumperConfig(prisma);
  const plan = resolveBumperPlan(globalBumper, channel);
  // A full rebuild always starts a brand-new pass sequence — no resume.
  const build = buildSchedule(pool, channel.ordering as OrderingStrategy, seed, from, min, plan, {
    maxDurationSeconds: opts.windowSeconds,
    strategy: parseStrategy(channel.strategy),
  });

  await prisma.$transaction([
    prisma.scheduleItem.deleteMany({ where: { channelId } }),
    prisma.scheduleItem.createMany({ data: toRows(channelId, build, itemIds) }),
    prisma.channel.update({
      where: { id: channelId },
      data: {
        // Stamp the config rev this full rebuild used, so Bumper Sync sees it as current.
        bumperRev: globalBumper.rev,
        ...cursorData(build.cursor),
      },
    }),
  ]);

  return summarize(channelId, pool.length, build, from);
}

export type ExtendResult = {
  extended: boolean;
  reason?: "empty" | "not-due";
  added: number;
  newEndsAt: Date | null;
};

/**
 * Append a fresh block at the tail when the schedule is running low — the routine,
 * non-disruptive path (leaves what's on now untouched). Returns `{ extended: false }`
 * if there's still plenty of runway, or `reason: "empty"` if there's nothing to
 * extend (call {@link generateChannelSchedule} first). `force` appends regardless.
 */
export async function extendChannelSchedule(
  prisma: PrismaClient,
  channelId: string,
  opts: {
    minDurationSeconds?: number;
    thresholdSeconds?: number;
    force?: boolean;
    /** Cap this append too (mid-pass), continuing the stored cursor. */
    windowSeconds?: number;
  } = {},
): Promise<ExtendResult> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const now = new Date();
  const last = await prisma.scheduleItem.findFirst({
    where: { channelId },
    orderBy: { startsAt: "desc" },
  });
  if (!last) return { extended: false, reason: "empty", added: 0, newEndsAt: null };

  const tailEnd = new Date(last.startsAt.getTime() + last.durationSeconds * 1000);
  const threshold = opts.thresholdSeconds ?? DEFAULT_EXTEND_THRESHOLD_SECONDS;
  const runwaySeconds = (tailEnd.getTime() - now.getTime()) / 1000;
  if (!opts.force && runwaySeconds > threshold) {
    return { extended: false, reason: "not-due", added: 0, newEndsAt: tailEnd };
  }

  const min = opts.minDurationSeconds ?? DEFAULT_MIN_HORIZON_SECONDS;
  const seed = await ensureSeed(prisma, channelId, channel.shuffleSeed);
  const pool = await resolveChannel(prisma, channelId);
  const itemIds = await upsertPoolItems(prisma, channel.mediaSourceId, pool);
  const globalBumper = await getGlobalBumperConfig(prisma);
  const plan = resolveBumperPlan(globalBumper, channel);
  // Extend appends a fresh tail under current settings but leaves the (possibly older)
  // head in place, so it deliberately does NOT re-stamp bumperRev — Bumper Sync still
  // sees a settings-changed channel as stale and does the full rebuild.
  //
  // Resume mid-pass when the previous build was windowed, so a capped channel walks
  // THROUGH its pool instead of replaying the top of it (which for IN_ORDER/BY_AIR_DATE
  // — where every pass is the same order — would loop the first N hours forever).
  const build = buildSchedule(pool, channel.ordering as OrderingStrategy, seed, tailEnd, min, plan, {
    maxDurationSeconds: opts.windowSeconds,
    resumeFrom: cursorOf(channel),
    strategy: parseStrategy(channel.strategy),
  });

  const pruneBefore = new Date(now.getTime() - HISTORY_KEEP_SECONDS * 1000);
  await prisma.$transaction([
    prisma.scheduleItem.deleteMany({ where: { channelId, startsAt: { lt: pruneBefore } } }),
    prisma.scheduleItem.createMany({ data: toRows(channelId, build, itemIds) }),
    prisma.channel.update({ where: { id: channelId }, data: cursorData(build.cursor) }),
  ]);

  const newLast = build.entries[build.entries.length - 1];
  return {
    extended: build.entries.length > 0,
    added: build.entries.length,
    newEndsAt: newLast
      ? new Date(newLast.startsAt.getTime() + newLast.durationSeconds * 1000)
      : tailEnd,
  };
}

/** Keep the currently-playing item and this much upcoming runway untouched when splicing. */
const REPAIR_BUFFER_SECONDS = 5 * 60;

export type RepairResult = {
  repaired: boolean;
  /** Slots removed from the spliced tail. */
  replaced: number;
  /** Fresh slots laid in their place. */
  added: number;
  /** Where the splice began, or null if nothing needed repair. */
  from: Date | null;
};

/**
 * Splice-repair a channel whose upcoming schedule references media that's been
 * removed from the server (`MediaItem.available = false`). Finds the earliest
 * upcoming bad slot (a program pointing at gone media, or a bumper introducing one),
 * then re-flows the timeline **from that point forward** with the current live pool —
 * which no longer contains the removed items. Everything before the splice (what's on
 * now + still-valid near-term slots) is left untouched. Non-disruptive, like extend;
 * does not re-stamp `bumperRev`.
 */
export async function repairChannelSchedule(
  prisma: PrismaClient,
  channelId: string,
  opts: { now?: Date; minDurationSeconds?: number; windowSeconds?: number } = {},
): Promise<RepairResult> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() + REPAIR_BUFFER_SECONDS * 1000);

  // Earliest upcoming slot referencing unavailable media (its own, or a bumper's target).
  const bad = await prisma.scheduleItem.findFirst({
    where: {
      channelId,
      startsAt: { gte: cutoff },
      OR: [{ mediaItem: { available: false } }, { targetMediaItem: { available: false } }],
    },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true },
  });
  if (!bad) return { repaired: false, replaced: 0, added: 0, from: null };

  // If an intro bumper immediately precedes the bad program, splice from the bumper so
  // we don't keep an "Up Next: <removed>" break (and leave no gap at the seam).
  let from = bad.startsAt;
  const prior = await prisma.scheduleItem.findFirst({
    where: { channelId, startsAt: { lt: bad.startsAt } },
    orderBy: { startsAt: "desc" },
    select: { kind: true, startsAt: true },
  });
  if (prior?.kind === "BUMPER") from = prior.startsAt;

  const replaced = await prisma.scheduleItem.count({
    where: { channelId, startsAt: { gte: from } },
  });

  const min = opts.minDurationSeconds ?? DEFAULT_MIN_HORIZON_SECONDS;
  const seed = await ensureSeed(prisma, channelId, channel.shuffleSeed);
  const pool = await resolveChannel(prisma, channelId); // Plex live → excludes removed media
  const itemIds = await upsertPoolItems(prisma, channel.mediaSourceId, pool);
  const globalBumper = await getGlobalBumperConfig(prisma);
  const plan = resolveBumperPlan(globalBumper, channel);
  // Repair re-flows the tail as a fresh pass (no resume — the pool just changed under us),
  // so it re-seeds the cursor rather than continuing the old one.
  const build = buildSchedule(pool, channel.ordering as OrderingStrategy, seed, from, min, plan, {
    maxDurationSeconds: opts.windowSeconds,
    strategy: parseStrategy(channel.strategy),
  });

  await prisma.$transaction([
    prisma.scheduleItem.deleteMany({ where: { channelId, startsAt: { gte: from } } }),
    prisma.scheduleItem.createMany({ data: toRows(channelId, build, itemIds) }),
    prisma.channel.update({ where: { id: channelId }, data: cursorData(build.cursor) }),
  ]);

  return { repaired: build.entries.length > 0, replaced, added: build.entries.length, from };
}

export type TimelineSlot = {
  id: string;
  kind: "PROGRAM" | "BUMPER";
  bumperKind: string | null;
  ratingKey: string | null;
  startsAt: Date;
  durationSeconds: number;
  /** For a bumper, this is the upcoming program it introduces ("Up Next"). */
  guide: GuideMeta;
};

/** Timeline slots overlapping [from, to) with joined guide metadata, ordered by start. */
export async function getChannelTimeline(
  prisma: PrismaClient,
  channelId: string,
  from: Date,
  to: Date,
): Promise<TimelineSlot[]> {
  const rows = await prisma.scheduleItem.findMany({
    where: { channelId, startsAt: { lt: to } },
    orderBy: { startsAt: "asc" },
    include: mediaItemGuideInclude,
  });
  return rows
    // Drop rows that already ended before the window (can't express endsAt in the where).
    .filter((r) => r.startsAt.getTime() + r.durationSeconds * 1000 > from.getTime())
    .map((r) => ({
      id: r.id,
      kind: r.kind,
      bumperKind: r.bumperKind,
      ratingKey: r.ratingKey,
      startsAt: r.startsAt,
      durationSeconds: r.durationSeconds,
      guide: r.kind === "BUMPER" ? guideMetaOfTarget(r) : guideMetaOf(r),
    }));
}

export type NowNextSlot = {
  kind: "PROGRAM" | "BUMPER";
  bumperKind: string | null;
  ratingKey: string | null;
  startsAt: Date;
  durationSeconds: number;
  guide: GuideMeta;
};

export type NowNext = {
  current: (NowNextSlot & { offsetSeconds: number }) | null;
  next: NowNextSlot | null;
  /** When the materialized schedule runs out — null if there's no schedule. */
  endsAt: Date | null;
};

/** "What's on now" (+ the live offset to seek to) and what's next, from materialized rows. */
export async function getNowNext(
  prisma: PrismaClient,
  channelId: string,
  at: Date = new Date(),
): Promise<NowNext> {
  const [row, nextRow, lastRow] = await Promise.all([
    prisma.scheduleItem.findFirst({
      where: { channelId, startsAt: { lte: at } },
      orderBy: { startsAt: "desc" },
      include: mediaItemGuideInclude,
    }),
    prisma.scheduleItem.findFirst({
      where: { channelId, startsAt: { gt: at } },
      orderBy: { startsAt: "asc" },
      include: mediaItemGuideInclude,
    }),
    prisma.scheduleItem.findFirst({ where: { channelId }, orderBy: { startsAt: "desc" } }),
  ]);

  const slot = (r: NonNullable<typeof row>): NowNextSlot => ({
    kind: r.kind,
    bumperKind: r.bumperKind,
    ratingKey: r.ratingKey,
    startsAt: r.startsAt,
    durationSeconds: r.durationSeconds,
    guide: r.kind === "BUMPER" ? guideMetaOfTarget(r) : guideMetaOf(r),
  });

  let current: NowNext["current"] = null;
  if (row) {
    const endMs = row.startsAt.getTime() + row.durationSeconds * 1000;
    // Only "on now" if the slot actually spans `at` (else the schedule is stale/gapped).
    if (endMs > at.getTime()) {
      current = {
        ...slot(row),
        offsetSeconds: Math.floor((at.getTime() - row.startsAt.getTime()) / 1000),
      };
    }
  }

  return {
    current,
    next: nextRow ? slot(nextRow) : null,
    endsAt: lastRow
      ? new Date(lastRow.startsAt.getTime() + lastRow.durationSeconds * 1000)
      : null,
  };
}
