import type { PrismaClient } from "@ChannelGuide/db";

/**
 * The user's recently-watched channels — the guide's "Recents" lens.
 *
 * Sourced from `ChannelWatchState`, which `heartbeatSession` upserts while something is playing.
 * Dedupe is inherent: the table is `@@unique([userId, channelId])`, so a channel watched a hundred
 * times is still one row, and `updatedAt` is when it was last watched. (`WatchSession` can't serve
 * this — it's `userId @unique`, i.e. only the current session.)
 */
export async function listRecentChannelIds(
  prisma: PrismaClient,
  userId: string,
  limit = 30,
): Promise<string[]> {
  const rows = await prisma.channelWatchState.findMany({
    where: { userId },
    select: { channelId: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => r.channelId);
}
