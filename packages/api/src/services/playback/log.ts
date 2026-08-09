import { Prisma, type PrismaClient } from "@airwave/db";

import type { GuideMeta } from "../plex/client";

/**
 * Records one tune attempt's full diagnostics to `PlaybackLog` — so test results
 * live in the DB (reviewable) instead of on the TV's debug overlay. The client
 * sends this when a tune settles (playing / not-decoding) or errors.
 */
export type PlaybackLogInput = {
  deviceId?: string | null;
  channelId?: string | null;
  channelName?: string | null;
  ratingKey?: string | null;
  title?: string | null;
  mode?: string | null;
  sourceContainer?: string | null;
  sourceVideoCodec?: string | null;
  sourceAudioCodec?: string | null;
  decision?: Prisma.InputJsonValue;
  caps?: Prisma.InputJsonValue;
  connection?: string | null;
  outcome?: string | null;
  decodedWidth?: number | null;
  decodedHeight?: number | null;
  readyState?: number | null;
  error?: string | null;
};

/** A flat view of the Plex delivery decision — declared so the tRPC output type stays shallow (the raw
 *  Prisma JsonValue is deeply recursive and blows up client-side type inference — TS2589). */
type StreamDecision = {
  videoDecision?: string;
  audioDecision?: string;
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
} | null;

/** Recent play logs across all users — the admin "Recent sessions & play logs" view. Each row is one
 *  tune attempt with its full delivery diagnostics (mode/codecs/decision/connection/outcome). */
export async function listRecentPlaybackLogs(prisma: PrismaClient, limit = 30) {
  const rows = await prisma.playbackLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
    include: { user: { select: { name: true, email: true } } },
  });
  // Resolve each item's PORTRAIT poster key (the show's grandparentRatingKey for episodes, else the item's
  // own) in one batch, so tiles show the show/movie poster — not a landscape episode still.
  const ratingKeys = [...new Set(rows.map((r) => r.ratingKey).filter((k): k is string => !!k))];
  const items = ratingKeys.length
    ? await prisma.mediaItem.findMany({
        where: { ratingKey: { in: ratingKeys } },
        select: { ratingKey: true, guide: true },
      })
    : [];
  const posterKeyByRating = new Map<string, string>();
  for (const it of items) {
    if (posterKeyByRating.has(it.ratingKey)) continue;
    const g = it.guide as GuideMeta | null;
    posterKeyByRating.set(it.ratingKey, g?.showRatingKey ?? it.ratingKey);
  }
  return rows.map((r) => {
    const posterKey = r.ratingKey ? (posterKeyByRating.get(r.ratingKey) ?? r.ratingKey) : null;
    return {
    id: r.id,
    user: r.user.name || r.user.email,
    deviceId: r.deviceId,
    channelId: r.channelId,
    channelName: r.channelName,
    ratingKey: r.ratingKey,
    thumbPath: posterKey ? `/library/metadata/${posterKey}/thumb` : null,
    title: r.title,
    mode: r.mode,
    sourceContainer: r.sourceContainer,
    sourceVideoCodec: r.sourceVideoCodec,
    sourceAudioCodec: r.sourceAudioCodec,
    decision: (r.decision ?? null) as unknown as StreamDecision,
    connection: r.connection,
    outcome: r.outcome,
    decodedWidth: r.decodedWidth,
    decodedHeight: r.decodedHeight,
    error: r.error,
    createdAt: r.createdAt,
    };
  });
}

export async function logPlayback(prisma: PrismaClient, userId: string, i: PlaybackLogInput) {
  const row = await prisma.playbackLog.create({
    data: {
      userId,
      deviceId: i.deviceId ?? null,
      channelId: i.channelId ?? null,
      channelName: i.channelName ?? null,
      ratingKey: i.ratingKey ?? null,
      title: i.title ?? null,
      mode: i.mode ?? null,
      sourceContainer: i.sourceContainer ?? null,
      sourceVideoCodec: i.sourceVideoCodec ?? null,
      sourceAudioCodec: i.sourceAudioCodec ?? null,
      decision: i.decision ?? Prisma.JsonNull,
      caps: i.caps ?? Prisma.JsonNull,
      connection: i.connection ?? null,
      outcome: i.outcome ?? null,
      decodedWidth: i.decodedWidth ?? null,
      decodedHeight: i.decodedHeight ?? null,
      readyState: i.readyState ?? null,
      error: i.error ?? null,
    },
  });
  return { ok: true as const, id: row.id };
}
