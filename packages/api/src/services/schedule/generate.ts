import type { PrismaClient } from "@ChannelGuide/db";

import { resolveChannel } from "../plex/resolve";
import { type OrderingStrategy, buildTimeline } from "./timeline";

const DAY_SECONDS = 86400;
/** Default materialization horizon — one admin week. Viewers read the first 24h. */
const DEFAULT_HORIZON_SECONDS = 7 * DAY_SECONDS;

/** Deterministic FNV-1a hash of the channel id — a stable fallback shuffle seed. */
function deriveSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type GenerateOptions = { from?: Date; horizonSeconds?: number };

export type GenerateResult = {
  channelId: string;
  poolSize: number;
  itemCount: number;
  loopSeconds: number;
  from: Date;
  to: Date;
};

/**
 * (Re)materialize a channel's schedule over a rolling horizon. The timeline is a
 * pure function of (resolved pool, ordering, seed, channel epoch), so this is
 * idempotent for a stable pool: the same `from` yields the same rows. Replaces the
 * whole timeline for the channel (past rows are irrelevant to a live guide).
 */
export async function generateChannelSchedule(
  prisma: PrismaClient,
  channelId: string,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("Channel not found");

  const from = opts.from ?? new Date();
  const horizon = opts.horizonSeconds ?? DEFAULT_HORIZON_SECONDS;
  const to = new Date(from.getTime() + horizon * 1000);

  // Pin a stable seed so the shuffle survives across regenerations.
  let seed = channel.shuffleSeed;
  if (seed == null) {
    seed = deriveSeed(channelId);
    await prisma.channel.update({ where: { id: channelId }, data: { shuffleSeed: seed } });
  }

  const pool = await resolveChannel(prisma, channelId);
  const { entries, loopSeconds } = buildTimeline(
    pool,
    channel.ordering as OrderingStrategy,
    seed,
    channel.createdAt,
    from,
    to,
  );

  await prisma.$transaction([
    prisma.scheduleItem.deleteMany({ where: { channelId } }),
    prisma.scheduleItem.createMany({
      data: entries.map((e) => ({
        channelId,
        kind: "PROGRAM" as const,
        startsAt: e.startsAt,
        durationSeconds: e.durationSeconds,
        startOffsetSeconds: e.startOffsetSeconds,
        ratingKey: e.ratingKey,
        guideData: { title: e.title },
      })),
    }),
  ]);

  return {
    channelId,
    poolSize: pool.length,
    itemCount: entries.length,
    loopSeconds,
    from,
    to,
  };
}

/** Timeline rows overlapping [from, to), ordered by start. */
export async function getChannelTimeline(
  prisma: PrismaClient,
  channelId: string,
  from: Date,
  to: Date,
) {
  const rows = await prisma.scheduleItem.findMany({
    where: { channelId, startsAt: { lt: to } },
    orderBy: { startsAt: "asc" },
  });
  // Drop rows that already ended before the window (can't express endsAt in the where).
  return rows.filter((r) => r.startsAt.getTime() + r.durationSeconds * 1000 > from.getTime());
}

export type NowNext = {
  current: {
    ratingKey: string;
    title: string;
    startsAt: Date;
    durationSeconds: number;
    offsetSeconds: number;
  } | null;
  next: { ratingKey: string; title: string; startsAt: Date; durationSeconds: number } | null;
};

/** "What's on now" (+ the live offset to seek to) and what's next, from materialized rows. */
export async function getNowNext(
  prisma: PrismaClient,
  channelId: string,
  at: Date = new Date(),
): Promise<NowNext> {
  const [row, nextRow] = await Promise.all([
    prisma.scheduleItem.findFirst({
      where: { channelId, startsAt: { lte: at } },
      orderBy: { startsAt: "desc" },
    }),
    prisma.scheduleItem.findFirst({
      where: { channelId, startsAt: { gt: at } },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const title = (r: { guideData: unknown }) =>
    (r.guideData as { title?: string } | null)?.title ?? "";

  let current: NowNext["current"] = null;
  if (row) {
    const endMs = row.startsAt.getTime() + row.durationSeconds * 1000;
    // Only "on now" if the slot actually spans `at` (else the schedule is stale/gapped).
    if (endMs > at.getTime()) {
      current = {
        ratingKey: row.ratingKey,
        title: title(row),
        startsAt: row.startsAt,
        durationSeconds: row.durationSeconds,
        offsetSeconds: Math.floor((at.getTime() - row.startsAt.getTime()) / 1000),
      };
    }
  }

  return {
    current,
    next: nextRow
      ? {
          ratingKey: nextRow.ratingKey,
          title: title(nextRow),
          startsAt: nextRow.startsAt,
          durationSeconds: nextRow.durationSeconds,
        }
      : null,
  };
}
