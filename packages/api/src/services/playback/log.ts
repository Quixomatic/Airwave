import { Prisma, type PrismaClient } from "@ChannelGuide/db";

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
