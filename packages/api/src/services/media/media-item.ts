import type { PrismaClient } from "@airwave/db";

import type { GuideMeta, PlexItem } from "../plex/client";

/** Progress callback shared by the sync services (fed to the job scheduler's progress). */
export type SyncProgress = (p: { current: number; total: number; label: string }) => void;

/** Prisma create/update payload for a MediaItem row from a resolved Plex item. */
export function toMediaItemData(
  mediaSourceId: string,
  item: PlexItem,
  parentId: string | null = null,
) {
  return {
    mediaSourceId,
    ratingKey: item.ratingKey,
    type: item.guide.type ?? "movie",
    title: item.title,
    durationMs: item.durationMs,
    year: item.year ?? null,
    airDate: item.originallyAvailableAt ?? null,
    parentId,
    guide: item.guide as object,
  };
}

/** Merge `over` onto `base`, ignoring `undefined` in `over` so it never wipes an inherited field. */
export function mergeGuide(base: GuideMeta, over: GuideMeta): GuideMeta {
  const out: GuideMeta = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

type MediaNode = { guide: unknown; parent?: { guide: unknown } | null } | null | undefined;

/** How to `include` a slot's metadata: its own item (programs) + its target program
 *  (bumpers introduce the upcoming program), each with its parent show for the merge. */
export const mediaItemGuideInclude = {
  mediaItem: { select: { guide: true, parent: { select: { guide: true } } } },
  targetMediaItem: { select: { guide: true, parent: { select: { guide: true } } } },
} as const;

/** Merge a MediaItem node's own guide over its parent show's (episode inherits genres/cast). */
function guideFromNode(mi: MediaNode): GuideMeta {
  if (!mi) return { title: "Unavailable" };
  const own = (mi.guide as GuideMeta | null) ?? { title: "Unavailable" };
  const parent = (mi.parent?.guide as GuideMeta | null | undefined) ?? undefined;
  return parent ? mergeGuide(parent, own) : own;
}

/**
 * The effective guide bundle for a program slot: the item's own metadata merged over
 * its parent show's. Falls back safely when the media has been unlinked/removed.
 */
export function guideMetaOf(row: { mediaItem?: MediaNode }): GuideMeta {
  return guideFromNode(row.mediaItem);
}

/** The guide bundle of the program a bumper introduces (its "Up Next" target). */
export function guideMetaOfTarget(row: { targetMediaItem?: MediaNode }): GuideMeta {
  return guideFromNode(row.targetMediaItem);
}

/**
 * Ensure a MediaItem exists for every item in a resolved pool (create-only, so a
 * later enrichment sync is never clobbered), linking episodes to their parent show
 * when that show is already cached. Returns a `ratingKey → id` map so schedule slots
 * can reference the rows. This is the gap-fill run at generation time; a full
 * `syncMediaItems` is what actually builds the show hierarchy.
 */
export async function upsertPoolItems(
  prisma: PrismaClient,
  mediaSourceId: string,
  pool: PlexItem[],
): Promise<Map<string, string>> {
  if (pool.length > 0) {
    const showKeys = [
      ...new Set(pool.map((p) => p.guide.showRatingKey).filter((k): k is string => !!k)),
    ];
    const shows = showKeys.length
      ? await prisma.mediaItem.findMany({
          where: { mediaSourceId, type: "show", ratingKey: { in: showKeys } },
          select: { id: true, ratingKey: true },
        })
      : [];
    const showIds = new Map(shows.map((s) => [s.ratingKey, s.id]));

    await prisma.mediaItem.createMany({
      data: pool.map((item) =>
        toMediaItemData(
          mediaSourceId,
          item,
          item.guide.showRatingKey ? (showIds.get(item.guide.showRatingKey) ?? null) : null,
        ),
      ),
      skipDuplicates: true,
    });
  }

  const rows = await prisma.mediaItem.findMany({
    where: { mediaSourceId, ratingKey: { in: pool.map((p) => p.ratingKey) } },
    select: { id: true, ratingKey: true },
  });
  return new Map(rows.map((r) => [r.ratingKey, r.id]));
}
