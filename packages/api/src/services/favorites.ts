import type { PrismaClient } from "@ChannelGuide/db";

/**
 * Per-user favorite channels — powers the guide's heart toggle and the "Favorites" lens. Stored
 * server-side (not per-device) so they follow the user across every device/platform.
 */

/** The channel ids this user has favorited, oldest first. */
export async function listFavoriteChannelIds(prisma: PrismaClient, userId: string): Promise<string[]> {
  const rows = await prisma.favorite.findMany({
    where: { userId },
    select: { channelId: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => r.channelId);
}

/**
 * Add or remove a favorite. Takes the DESIRED state rather than toggling server-side, so it's
 * idempotent — a retry, a double-press, or a racing optimistic update can't flip it back.
 */
export async function setFavorite(
  prisma: PrismaClient,
  userId: string,
  channelId: string,
  favorite: boolean,
): Promise<{ channelId: string; favorited: boolean }> {
  if (favorite) {
    await prisma.favorite.upsert({
      where: { userId_channelId: { userId, channelId } },
      create: { userId, channelId },
      update: {},
    });
  } else {
    await prisma.favorite.deleteMany({ where: { userId, channelId } });
  }
  return { channelId, favorited: favorite };
}
