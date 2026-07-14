import type { PrismaClient } from "@ChannelGuide/db";

import { guideMetaOf, mediaItemGuideInclude } from "./media/media-item";

/**
 * Cross-channel guide data — shared by the tRPC admin preview (`channels.guide`)
 * and the REST TV API. Business logic here so both transports stay thin.
 */

const guideChannelSelect = {
  id: true,
  number: true,
  name: true,
  callsign: true,
  icon: true,
  tint: true,
  package: { select: { icon: true, tint: true, name: true } },
} as const;

/** Enabled channels in guide/lineup order — the TV client's channel list (surfing). */
export async function listGuideChannels(prisma: PrismaClient) {
  return prisma.channel.findMany({
    where: { enabled: true },
    orderBy: { number: "asc" },
    select: guideChannelSelect,
  });
}

/**
 * The guide grid: every enabled channel with its currently-airing + upcoming
 * PROGRAM slots over the window, guide metadata merged. One query for all
 * channels. Bumpers are omitted (tiny interstitials).
 */
export async function getGuideGrid(prisma: PrismaClient, forwardMinutes: number) {
  const channels = await listGuideChannels(prisma);
  const now = new Date();
  const from = new Date(now.getTime() - 6 * 3600_000);
  const to = new Date(now.getTime() + forwardMinutes * 60_000);
  const rows = await prisma.scheduleItem.findMany({
    where: {
      channelId: { in: channels.map((c) => c.id) },
      kind: "PROGRAM",
      startsAt: { gte: from, lt: to },
    },
    orderBy: { startsAt: "asc" },
    include: mediaItemGuideInclude,
  });

  const byChannel = new Map<string, typeof rows>();
  for (const r of rows) {
    // Keep only programs still airing or upcoming within the window.
    if (r.startsAt.getTime() + r.durationSeconds * 1000 <= now.getTime()) continue;
    const list = byChannel.get(r.channelId) ?? [];
    list.push(r);
    byChannel.set(r.channelId, list);
  }

  return {
    serverTime: now,
    windowMinutes: forwardMinutes,
    channels: channels.map((c) => ({
      ...c,
      programs: (byChannel.get(c.id) ?? []).map((r) => ({
        id: r.id,
        ratingKey: r.ratingKey,
        startsAt: r.startsAt,
        durationSeconds: r.durationSeconds,
        guide: guideMetaOf(r),
      })),
    })),
  };
}
