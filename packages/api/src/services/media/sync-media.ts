import type { PrismaClient } from "@ChannelGuide/db";

import { type PlexItem, getAllSectionItems } from "../plex/client";
import { toMediaItemData } from "./media-item";

/** Full upsert (refresh) of a batch of items, each with an optional parent-show id. */
async function upsertMany(
  prisma: PrismaClient,
  mediaSourceId: string,
  entries: Array<{ item: PlexItem; parentId: string | null }>,
): Promise<void> {
  const now = new Date();
  const chunk = 20;
  for (let i = 0; i < entries.length; i += chunk) {
    await prisma.$transaction(
      entries.slice(i, i + chunk).map(({ item, parentId }) => {
        const data = toMediaItemData(mediaSourceId, item, parentId);
        return prisma.mediaItem.upsert({
          where: { mediaSourceId_ratingKey: { mediaSourceId, ratingKey: item.ratingKey } },
          create: data,
          update: { ...data, available: true, lastSyncedAt: now },
        });
      }),
    );
  }
}

/** Upsert shows and return a `showRatingKey → mediaItemId` map for linking episodes. */
async function upsertShows(
  prisma: PrismaClient,
  mediaSourceId: string,
  shows: PlexItem[],
): Promise<Map<string, string>> {
  const now = new Date();
  const map = new Map<string, string>();
  const chunk = 20;
  for (let i = 0; i < shows.length; i += chunk) {
    const slice = shows.slice(i, i + chunk);
    const rows = await prisma.$transaction(
      slice.map((item) => {
        const data = toMediaItemData(mediaSourceId, item, null);
        return prisma.mediaItem.upsert({
          where: { mediaSourceId_ratingKey: { mediaSourceId, ratingKey: item.ratingKey } },
          create: data,
          update: { ...data, available: true, lastSyncedAt: now },
          select: { id: true, ratingKey: true },
        });
      }),
    );
    for (const r of rows) map.set(r.ratingKey, r.id);
  }
  return map;
}

export type SyncResult = { libraries: number; shows: number; items: number };

/**
 * Refresh the metadata cache for a source's enabled libraries. Builds the show
 * hierarchy: shows are upserted first, then episodes are linked to their parent show
 * (which holds the shared genres/cast/studio). Movies are standalone. Upsert-only —
 * never deletes, so schedules built on now-removed media still render.
 */
export async function syncMediaItems(prisma: PrismaClient, sourceId: string): Promise<SyncResult> {
  const source = await prisma.mediaSource.findUnique({
    where: { id: sourceId },
    include: { libraries: { where: { enabled: true } } },
  });
  if (!source?.baseUrl) throw new Error("Source is not connected.");
  const { baseUrl, token } = source;

  let shows = 0;
  let items = 0;
  for (const lib of source.libraries) {
    if (lib.type === "show") {
      const showItems = await getAllSectionItems(baseUrl, token, lib.key, 2);
      const showIds = await upsertShows(prisma, source.id, showItems);
      shows += showItems.length;

      const episodes = await getAllSectionItems(baseUrl, token, lib.key, 4);
      await upsertMany(
        prisma,
        source.id,
        episodes.map((item) => ({
          item,
          parentId: item.guide.showRatingKey
            ? (showIds.get(item.guide.showRatingKey) ?? null)
            : null,
        })),
      );
      items += episodes.length;
    } else {
      const movies = await getAllSectionItems(baseUrl, token, lib.key, 1);
      await upsertMany(
        prisma,
        source.id,
        movies.map((item) => ({ item, parentId: null })),
      );
      items += movies.length;
    }
  }

  return { libraries: source.libraries.length, shows, items };
}
