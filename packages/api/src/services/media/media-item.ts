import type { PrismaClient } from "@ChannelGuide/db";

import type { GuideMeta, PlexItem } from "../plex/client";

/** Prisma create/update payload for a MediaItem row from a resolved Plex item. */
export function toMediaItemData(mediaSourceId: string, item: PlexItem) {
  return {
    mediaSourceId,
    ratingKey: item.ratingKey,
    type: item.guide.type ?? "movie",
    title: item.title,
    durationMs: item.durationMs,
    year: item.year ?? null,
    airDate: item.originallyAvailableAt ?? null,
    guide: item.guide as object,
  };
}

/** The stored guide bundle for a row, with a safe fallback for unlinked/removed media. */
export function guideMetaOf(row: { mediaItem?: { guide: unknown } | null }): GuideMeta {
  const guide = row.mediaItem?.guide as GuideMeta | null | undefined;
  return guide ?? { title: "Unavailable" };
}

/**
 * Ensure a MediaItem exists for every item in a resolved pool (create-only, so a
 * later enrichment sync is never clobbered), and return a `ratingKey → id` map so
 * schedule slots can be linked. This is the gap-fill run at generation time.
 */
export async function upsertPoolItems(
  prisma: PrismaClient,
  mediaSourceId: string,
  pool: PlexItem[],
): Promise<Map<string, string>> {
  if (pool.length > 0) {
    await prisma.mediaItem.createMany({
      data: pool.map((item) => toMediaItemData(mediaSourceId, item)),
      skipDuplicates: true,
    });
  }
  const rows = await prisma.mediaItem.findMany({
    where: { mediaSourceId, ratingKey: { in: pool.map((p) => p.ratingKey) } },
    select: { id: true, ratingKey: true },
  });
  return new Map(rows.map((r) => [r.ratingKey, r.id]));
}
