import type { PrismaClient } from "@ChannelGuide/db";

import { type PlexItem, getMetadata, getRecentlyAdded } from "../plex/client";
import type { SyncProgress } from "./media-item";
import { upsertMany, upsertShows } from "./sync-media";

/** How many recent items to pull per library each incremental pass. */
const RECENT_LIMIT = 50;

/**
 * Ensure a parent-show MediaItem exists for each of these episodes, backfilling any
 * missing show from the server. Returns a `showRatingKey → mediaItemId` map.
 */
async function ensureShows(
  prisma: PrismaClient,
  source: { id: string; baseUrl: string; token: string },
  episodes: PlexItem[],
): Promise<Map<string, string>> {
  const showKeys = [
    ...new Set(episodes.map((e) => e.guide.showRatingKey).filter((k): k is string => !!k)),
  ];
  if (showKeys.length === 0) return new Map();

  const cached = await prisma.mediaItem.findMany({
    where: { mediaSourceId: source.id, type: "show", ratingKey: { in: showKeys } },
    select: { id: true, ratingKey: true },
  });
  const map = new Map(cached.map((s) => [s.ratingKey, s.id]));

  const missing = showKeys.filter((k) => !map.has(k));
  const fetched: PlexItem[] = [];
  for (const key of missing) {
    const show = await getMetadata(source.baseUrl, source.token, key);
    if (show) fetched.push(show);
  }
  if (fetched.length > 0) {
    const newIds = await upsertShows(prisma, source.id, fetched);
    for (const [k, v] of newIds) map.set(k, v);
  }
  return map;
}

export type RecentResult = { libraries: number; items: number };

/**
 * Cheap incremental scan: upsert just the most-recently-added items per enabled
 * library (movies, or episodes with their parent show backfilled). Runs frequently
 * so new content lands in the cache without a full scan. Does not detect removals —
 * that's the full {@link syncMediaItems}.
 */
export async function syncRecentlyAdded(
  prisma: PrismaClient,
  sourceId: string,
  onProgress?: SyncProgress,
): Promise<RecentResult> {
  const source = await prisma.mediaSource.findUnique({
    where: { id: sourceId },
    include: { libraries: { where: { enabled: true } } },
  });
  if (!source?.baseUrl) throw new Error("Source is not connected.");
  const ctx = { id: source.id, baseUrl: source.baseUrl, token: source.token };

  let items = 0;
  for (const lib of source.libraries) {
    onProgress?.({ current: 0, total: 0, label: `Recently added · ${lib.title}` });
    if (lib.type === "show") {
      const episodes = await getRecentlyAdded(ctx.baseUrl, ctx.token, lib.key, 4, RECENT_LIMIT);
      const showIds = await ensureShows(prisma, ctx, episodes);
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
      const movies = await getRecentlyAdded(ctx.baseUrl, ctx.token, lib.key, 1, RECENT_LIMIT);
      await upsertMany(
        prisma,
        source.id,
        movies.map((item) => ({ item, parentId: null })),
      );
      items += movies.length;
    }
  }

  return { libraries: source.libraries.length, items };
}
