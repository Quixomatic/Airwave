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
import { type BuildResult, type OrderingStrategy, buildSchedule } from "./timeline";

const DAY_SECONDS = 86400;
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

/**
 * Build the channel's whole lineup fresh from `now` and replace the timeline. Use
 * after the filter/pool changes (it necessarily disturbs what's on now). For a
 * channel that's just running low, prefer {@link extendChannelSchedule}.
 */
export async function generateChannelSchedule(
  prisma: PrismaClient,
  channelId: string,
  opts: { from?: Date; minDurationSeconds?: number } = {},
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
  const build = buildSchedule(pool, channel.ordering as OrderingStrategy, seed, from, min, plan);

  await prisma.$transaction([
    prisma.scheduleItem.deleteMany({ where: { channelId } }),
    prisma.scheduleItem.createMany({ data: toRows(channelId, build, itemIds) }),
    // Stamp the config rev this full rebuild used, so Bumper Sync sees it as current.
    prisma.channel.update({ where: { id: channelId }, data: { bumperRev: globalBumper.rev } }),
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
  opts: { minDurationSeconds?: number; thresholdSeconds?: number; force?: boolean } = {},
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
  const build = buildSchedule(pool, channel.ordering as OrderingStrategy, seed, tailEnd, min, plan);

  const pruneBefore = new Date(now.getTime() - HISTORY_KEEP_SECONDS * 1000);
  await prisma.$transaction([
    prisma.scheduleItem.deleteMany({ where: { channelId, startsAt: { lt: pruneBefore } } }),
    prisma.scheduleItem.createMany({ data: toRows(channelId, build, itemIds) }),
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
