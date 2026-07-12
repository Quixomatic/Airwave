import type { PrismaClient } from "@ChannelGuide/db";

import { type GuideMeta, type PlexItem, getAllSectionItems } from "../plex/client";
import { toMediaItemData } from "./media-item";

/**
 * Episodes only carry their own fields; genres/cast/studio live on the parent show.
 * Fill the episode's gaps from its show so a TV slot is as rich as a movie slot.
 */
function enrichEpisode(ep: GuideMeta, show: GuideMeta | undefined): GuideMeta {
  if (!show) return ep;
  return {
    ...ep,
    genres: ep.genres ?? show.genres,
    cast: ep.cast ?? show.cast,
    studio: ep.studio ?? show.studio,
    directors: ep.directors ?? show.directors,
    contentRating: ep.contentRating ?? show.contentRating,
  };
}

/** Full upsert (refresh + enrich) of a batch of items into the metadata cache. */
async function upsertMany(
  prisma: PrismaClient,
  mediaSourceId: string,
  items: PlexItem[],
): Promise<number> {
  const now = new Date();
  const chunk = 20;
  for (let i = 0; i < items.length; i += chunk) {
    await prisma.$transaction(
      items.slice(i, i + chunk).map((item) => {
        const data = toMediaItemData(mediaSourceId, item);
        return prisma.mediaItem.upsert({
          where: { mediaSourceId_ratingKey: { mediaSourceId, ratingKey: item.ratingKey } },
          create: data,
          update: { ...data, available: true, lastSyncedAt: now },
        });
      }),
    );
  }
  return items.length;
}

export type SyncResult = { libraries: number; items: number };

/**
 * Refresh the metadata cache for a source's enabled libraries. Movies map straight
 * through; episodes are enriched from their parent show's metadata. Upsert-only —
 * never deletes, so schedules built on now-removed media still render.
 */
export async function syncMediaItems(prisma: PrismaClient, sourceId: string): Promise<SyncResult> {
  const source = await prisma.mediaSource.findUnique({
    where: { id: sourceId },
    include: { libraries: { where: { enabled: true } } },
  });
  if (!source?.baseUrl) throw new Error("Source is not connected.");
  const { baseUrl, token } = source;

  let items = 0;
  for (const lib of source.libraries) {
    if (lib.type === "show") {
      const shows = await getAllSectionItems(baseUrl, token, lib.key, 2);
      const showGuides = new Map(shows.map((s) => [s.ratingKey, s.guide]));
      const episodes = await getAllSectionItems(baseUrl, token, lib.key, 4);
      const enriched = episodes.map((ep) => ({
        ...ep,
        guide: enrichEpisode(
          ep.guide,
          ep.guide.showRatingKey ? showGuides.get(ep.guide.showRatingKey) : undefined,
        ),
      }));
      items += await upsertMany(prisma, source.id, enriched);
    } else {
      const movies = await getAllSectionItems(baseUrl, token, lib.key, 1);
      items += await upsertMany(prisma, source.id, movies);
    }
  }

  return { libraries: source.libraries.length, items };
}
