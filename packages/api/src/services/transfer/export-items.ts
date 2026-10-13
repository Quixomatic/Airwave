import type { PrismaClient } from "@airwave/db";

import { type GuideMeta, type PlexItem, getMetadata } from "../plex/client";
import type { ResolveSource } from "../plex/resolve";
import type { ExportItem } from "./schema";

/**
 * Resolve a MANUAL / MEMBERSHIP definition's referenced ratingKeys into portable {@link ExportItem}s (external
 * GUIDs + hints) for the lineup export. Reads ids from the `MediaItem` columns; for any referenced item whose
 * ids are missing (cached before the id columns existed, or not yet synced) it BACKFILLS live from Plex
 * (`getMetadata`, which sends `includeGuids=1`) and persists the ids back onto the row — so an export is
 * complete even without a prior re-sync (`.plans/export-import-schema-versioning.md` P3). A bounded lookup:
 * only the referenced items, only the ones missing ids. Output preserves input order.
 */
export async function resolveExportItems(
  prisma: PrismaClient,
  source: ResolveSource,
  keys: string[],
): Promise<ExportItem[]> {
  if (keys.length === 0) return [];

  const rows = await prisma.mediaItem.findMany({
    where: { mediaSourceId: source.id, ratingKey: { in: keys } },
    select: { ratingKey: true, type: true, title: true, year: true, airDate: true, guide: true, tmdbId: true, tvdbId: true, imdbId: true },
  });
  const byKey = new Map(rows.map((r) => [r.ratingKey, r]));

  // Backfill: a key not cached, or cached with NO external id, gets a live fetch (if we can reach Plex).
  const needLive = source.baseUrl
    ? keys.filter((k) => {
        const r = byKey.get(k);
        return !r || (!r.tmdbId && !r.tvdbId && !r.imdbId);
      })
    : [];
  const liveByKey = new Map<string, PlexItem>();
  for (const k of needLive) {
    const item = await getMetadata(source.baseUrl, source.token, k);
    if (item) liveByKey.set(k, item);
  }
  // Persist the backfilled ids (fill only, never null; updateMany no-ops when the row isn't cached yet).
  for (const [k, item] of liveByKey) {
    const data: { tmdbId?: string; tvdbId?: string; imdbId?: string } = {};
    if (item.tmdbId) data.tmdbId = item.tmdbId;
    if (item.tvdbId) data.tvdbId = item.tvdbId;
    if (item.imdbId) data.imdbId = item.imdbId;
    if (Object.keys(data).length > 0)
      await prisma.mediaItem.updateMany({ where: { mediaSourceId: source.id, ratingKey: k }, data }).catch(() => {});
  }

  return keys.map((k) => {
    const live = liveByKey.get(k);
    if (live) {
      const g = live.guide;
      return item(k, g.type ?? byKey.get(k)?.type ?? "movie", live.title, live.year, live.originallyAvailableAt, g, live);
    }
    const r = byKey.get(k);
    if (r) return item(k, r.type, r.title, r.year, r.airDate, r.guide as GuideMeta | null, r);
    // Not cached and no live fetch succeeded — emit a bare ref so the count is honest (import marks it unmatched).
    return { ratingKey: k, type: "movie" };
  });
}

function item(
  ratingKey: string,
  type: string,
  title: string | undefined,
  year: number | null | undefined,
  airDate: string | null | undefined,
  guide: GuideMeta | null,
  ids: { tmdbId?: string | null; tvdbId?: string | null; imdbId?: string | null },
): ExportItem {
  const g = guide ?? ({} as GuideMeta);
  return {
    ratingKey,
    type,
    tmdbId: ids.tmdbId ?? undefined,
    tvdbId: ids.tvdbId ?? undefined,
    imdbId: ids.imdbId ?? undefined,
    title: title || g.title || undefined,
    year: year ?? undefined,
    showTitle: g.showTitle,
    season: g.season,
    episode: g.episode,
    airDate: airDate ?? undefined,
  };
}
