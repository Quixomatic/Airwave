import type { PrismaClient } from "@ChannelGuide/db";

import type { AccessSet } from "./access/access";
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
  package: { select: { id: true, key: true, icon: true, tint: true, name: true } },
} as const;

/**
 * Enabled channels in guide/lineup order — the TV client's channel list (surfing). `accessible` scopes it
 * to what the viewer may see (`"all"` → every enabled channel; a Set → only those ids); see access control §7.13.
 */
export async function listGuideChannels(prisma: PrismaClient, accessible: AccessSet = "all") {
  const channels = await prisma.channel.findMany({
    where: { enabled: true },
    orderBy: { number: "asc" },
    select: guideChannelSelect,
  });
  return accessible === "all" ? channels : channels.filter((c) => accessible.has(c.id));
}

/**
 * The guide grid: every enabled channel with its recently-aired + currently-airing
 * + upcoming PROGRAM slots over the window, guide metadata merged. One query for all
 * channels. Bumpers are omitted (tiny interstitials).
 *
 * `backMinutes` includes programs that ended within the recent past so the guide's
 * left/lead area isn't blank (they're still rewindable via the DVR timeshift window).
 */
export async function getGuideGrid(
  prisma: PrismaClient,
  forwardMinutes: number,
  backMinutes = 60,
  accessible: AccessSet = "all",
) {
  const channels = await listGuideChannels(prisma, accessible);
  const now = new Date();
  // Query broadly (6h) so a long program that started well before the window but is
  // still airing is caught; the filter below trims to the visible past/future span.
  const from = new Date(now.getTime() - 6 * 3600_000);
  const to = new Date(now.getTime() + forwardMinutes * 60_000);
  const pastCutoff = now.getTime() - backMinutes * 60_000;
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
    // Keep programs that ended within the recent past window, are airing, or upcoming.
    if (r.startsAt.getTime() + r.durationSeconds * 1000 <= pastCutoff) continue;
    const list = byChannel.get(r.channelId) ?? [];
    list.push(r);
    byChannel.set(r.channelId, list);
  }

  return {
    serverTime: now,
    windowMinutes: forwardMinutes,
    backMinutes,
    channels: channels.map((c) => {
      const list = byChannel.get(c.id) ?? [];
      return {
        ...c,
        programs: list.map((r, i) => {
          // Absorb the trailing interstitial (bumper) gap into this program: a break
          // between two programs is broadcast-style "part of" the program before it,
          // so the guide runs edge-to-edge with no gaps. Extend this program's shown
          // duration to the next program's start; the last one keeps its real duration.
          const next = list[i + 1];
          const durationSeconds = next
            ? Math.max(r.durationSeconds, Math.round((next.startsAt.getTime() - r.startsAt.getTime()) / 1000))
            : r.durationSeconds;
          return {
            id: r.id,
            ratingKey: r.ratingKey,
            startsAt: r.startsAt,
            durationSeconds,
            guide: guideMetaOf(r),
          };
        }),
      };
    }),
  };
}
