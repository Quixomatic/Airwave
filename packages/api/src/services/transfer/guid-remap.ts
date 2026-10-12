import type { PrismaClient } from "@airwave/db";

import { type MatchHints, matchByGuid } from "../plex/client";
import type { ResolveSource } from "../plex/resolve";

/**
 * The GUID → local-ratingKey remap for cross-server channel import (`.plans/export-import-schema-versioning.md`).
 * A manual/membership channel's items travel by portable external ids (tmdb/tvdb/imdb, not server-local
 * ratingKeys); on import we resolve each to THIS server's ratingKey. Tiered:
 *   1. INDEXED CACHE LOOKUP over the `MediaItem` tmdb/tvdb/imdb columns — one bulk query resolves everything
 *      already synced.
 *   2. LIVE FALLBACK via `GET /library/matches` for the stragglers (added since the last sync, or an
 *      unsynced library) — accept score ≥ 85 for movies/shows, the single exact match for episodes.
 *   3. PERSIST the live hits' ids onto the cached rows (self-heal → next time it's a pure indexed hit).
 *   4. REPORT matched vs unmatched. Unmatched is never a hard failure — the caller skips with a note.
 */

/** A portable reference to one media item in an exported channel (a manual pick / membership member). */
export type GuidRef = {
  /** An opaque handle echoed back in the result so the caller can map a hit to its source entry (e.g. the
   *  original manualItemKey, or a membership member index). */
  ref: string;
  type: "movie" | "show" | "episode";
  tmdbId?: string;
  tvdbId?: string;
  imdbId?: string;
  // Hints for the live fallback + episode disambiguation.
  title?: string;
  year?: number;
  showTitle?: string;
  season?: number;
  episode?: number;
  airDate?: string;
};

export type GuidRemapHit = { ref: string; ratingKey: string; via: "cache" | "live" };
export type GuidRemapResult = {
  hits: GuidRemapHit[];
  unmatched: GuidRef[];
  counts: { total: number; cache: number; live: number; unmatched: number };
};

const PLEX_TYPE = { movie: 1, show: 2, episode: 4 } as const;
/** Plex's own "positive match" bar for `/library/matches` (movies/shows). Episodes carry no score. */
const LIVE_SCORE_MIN = 85;

/* ---------------- Pure cache-index resolution (unit-testable, no DB) ------------------------------- */

export type CacheRow = { ratingKey: string; type: string; tmdbId: string | null; tvdbId: string | null; imdbId: string | null };
export type CacheIndex = { byTmdb: Map<string, CacheRow[]>; byTvdb: Map<string, CacheRow[]>; byImdb: Map<string, CacheRow[]> };

/** Index cached rows by each external id (an id can, rarely, sit on more than one row — keep them all). */
export function indexCacheRows(rows: CacheRow[]): CacheIndex {
  const byTmdb = new Map<string, CacheRow[]>();
  const byTvdb = new Map<string, CacheRow[]>();
  const byImdb = new Map<string, CacheRow[]>();
  const add = (m: Map<string, CacheRow[]>, k: string | null, r: CacheRow) => {
    if (k) (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  };
  for (const r of rows) {
    add(byTmdb, r.tmdbId, r);
    add(byTvdb, r.tvdbId, r);
    add(byImdb, r.imdbId, r);
  }
  return { byTmdb, byTvdb, byImdb };
}

/** Resolve one ref against the index — try tmdb → imdb → tvdb, preferring a row whose type matches the ref.
 *  Returns the ratingKey or null (a miss → the live fallback). */
export function resolveFromIndex(ref: GuidRef, idx: CacheIndex): string | null {
  const tries: Array<[Map<string, CacheRow[]>, string | undefined]> = [
    [idx.byTmdb, ref.tmdbId],
    [idx.byImdb, ref.imdbId],
    [idx.byTvdb, ref.tvdbId],
  ];
  for (const [map, id] of tries) {
    if (!id) continue;
    const rows = map.get(id);
    if (!rows?.length) continue;
    return (rows.find((r) => r.type === ref.type) ?? rows[0]).ratingKey;
  }
  return null;
}

const hasAnyId = (r: GuidRef) => !!(r.tmdbId || r.tvdbId || r.imdbId);

/* ---------------- Live fallback + persistence ------------------------------------------------------ */

/** Resolve one ref against the live server via `/library/matches`. Tries tmdb → imdb → tvdb. */
async function liveMatch(source: ResolveSource, ref: GuidRef): Promise<string | null> {
  const ptype = PLEX_TYPE[ref.type];
  const hints: MatchHints =
    ref.type === "episode"
      ? { grandparentTitle: ref.showTitle, parentIndex: ref.season, index: ref.episode, originallyAvailableAt: ref.airDate, year: ref.year, title: ref.title }
      : { title: ref.title, year: ref.year };
  const schemes = [
    ref.tmdbId && (`tmdb://${ref.tmdbId}` as const),
    ref.imdbId && (`imdb://${ref.imdbId}` as const),
    ref.tvdbId && (`tvdb://${ref.tvdbId}` as const),
  ].filter((s): s is string => !!s);

  for (const guid of schemes) {
    const matches = await matchByGuid(source.baseUrl, source.token, ptype, guid, hints);
    if (!matches.length) continue;
    const best = matches[0]; // sorted by score desc
    // Episodes carry no score (a single exact match is trustworthy); movies/shows must clear Plex's bar.
    if (ref.type === "episode" || (best.score ?? 0) >= LIVE_SCORE_MIN) return best.ratingKey;
  }
  return null;
}

/** Self-heal: fill the matched rows' id columns from the live hits, so a repeat import is a pure indexed hit.
 *  Only FILLS the ids we have (never nulls the rest) and only touches EXISTING rows (updateMany no-ops when
 *  the item isn't cached yet — the next full sync creates + fills it). Never touches parentId/guide. */
async function persistLiveIds(prisma: PrismaClient, sourceId: string, hits: Array<{ ref: GuidRef; ratingKey: string }>): Promise<void> {
  for (const { ref, ratingKey } of hits) {
    const data: { tmdbId?: string; tvdbId?: string; imdbId?: string } = {};
    if (ref.tmdbId) data.tmdbId = ref.tmdbId;
    if (ref.tvdbId) data.tvdbId = ref.tvdbId;
    if (ref.imdbId) data.imdbId = ref.imdbId;
    if (Object.keys(data).length === 0) continue;
    await prisma.mediaItem.updateMany({ where: { mediaSourceId: sourceId, ratingKey }, data }).catch(() => {});
  }
}

/* ---------------- The resolver ---------------------------------------------------------------------- */

export async function remapGuids(prisma: PrismaClient, source: ResolveSource, refs: GuidRef[]): Promise<GuidRemapResult> {
  const hits: GuidRemapHit[] = [];
  const unmatched: GuidRef[] = [];
  if (refs.length === 0) return { hits, unmatched, counts: { total: 0, cache: 0, live: 0, unmatched: 0 } };

  // 1. Bulk indexed cache lookup over the id columns (only refs that actually carry an id).
  const withIds = refs.filter(hasAnyId);
  const uniq = (xs: Array<string | undefined>) => [...new Set(xs.filter((s): s is string => !!s))];
  const or: Array<{ tmdbId: { in: string[] } } | { tvdbId: { in: string[] } } | { imdbId: { in: string[] } }> = [];
  const tmdb = uniq(withIds.map((r) => r.tmdbId));
  const tvdb = uniq(withIds.map((r) => r.tvdbId));
  const imdb = uniq(withIds.map((r) => r.imdbId));
  if (tmdb.length) or.push({ tmdbId: { in: tmdb } });
  if (tvdb.length) or.push({ tvdbId: { in: tvdb } });
  if (imdb.length) or.push({ imdbId: { in: imdb } });
  const rows = or.length
    ? await prisma.mediaItem.findMany({
        where: { mediaSourceId: source.id, available: true, OR: or },
        select: { ratingKey: true, type: true, tmdbId: true, tvdbId: true, imdbId: true },
      })
    : [];
  const idx = indexCacheRows(rows);

  const misses: GuidRef[] = [];
  for (const ref of refs) {
    const rk = hasAnyId(ref) ? resolveFromIndex(ref, idx) : null;
    if (rk) hits.push({ ref: ref.ref, ratingKey: rk, via: "cache" });
    else misses.push(ref);
  }
  const cacheN = hits.length;

  // 2. Live fallback per straggler.
  const liveHits: Array<{ ref: GuidRef; ratingKey: string }> = [];
  for (const ref of misses) {
    const rk = hasAnyId(ref) ? await liveMatch(source, ref) : null;
    if (rk) {
      hits.push({ ref: ref.ref, ratingKey: rk, via: "live" });
      liveHits.push({ ref, ratingKey: rk });
    } else {
      unmatched.push(ref);
    }
  }

  // 3. Persist live hits' ids (best-effort self-heal).
  await persistLiveIds(prisma, source.id, liveHits);

  return {
    hits,
    unmatched,
    counts: { total: refs.length, cache: cacheN, live: liveHits.length, unmatched: unmatched.length },
  };
}
