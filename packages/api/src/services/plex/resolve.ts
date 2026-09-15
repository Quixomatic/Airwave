import type { PrismaClient } from "@airwave/db";

import {
  type GuideMeta,
  type PlexItem,
  getCollectionItems,
  getFilterValues,
  getMetadataByKeys,
  getPlaylistItems,
  getSectionItemsRaw,
} from "./client";
import { type FilterCondition, type FilterNode, buildParam } from "./filter-fields";
import { channelSortParam } from "./sort-fields";
import { decryptToken } from "./token";

type LibCtx = {
  baseUrl: string;
  token: string;
  sectionKey: string;
  // Movies resolve at type=1. TV resolves at type=4 (episodes) using Plex's dotted
  // advanced-filter syntax (`show.genre`, `episode.resolution`) so show-level and
  // episode-level fields both work in one query. `tv` toggles the field prefixing.
  type: 1 | 4;
  tv: boolean;
  sort: string;
  tagCache: Map<string, Promise<Map<string, string>>>;
};

async function resolveTag(ctx: LibCtx, plexField: string, title: string): Promise<string | undefined> {
  let p = ctx.tagCache.get(plexField);
  if (!p) {
    p = getFilterValues(ctx.baseUrl, ctx.token, ctx.sectionKey, plexField).then(
      (vals) => new Map(vals.map((v) => [v.title.toLowerCase(), v.id])),
    );
    ctx.tagCache.set(plexField, p);
  }
  return (await p).get(title.toLowerCase());
}

function toMap(items: PlexItem[]): Map<string, PlexItem> {
  return new Map(items.map((i) => [i.ratingKey, i]));
}

async function queryParams(ctx: LibCtx, params: string[]): Promise<Map<string, PlexItem>> {
  return toMap(await getSectionItemsRaw(ctx.baseUrl, ctx.token, ctx.sectionKey, ctx.type, params, ctx.sort));
}

async function resolveNode(node: FilterNode, ctx: LibCtx): Promise<Map<string, PlexItem>> {
  const opts = { libType: ctx.tv ? ("show" as const) : ("movie" as const) };
  if (node.type === "condition") {
    const param = await buildParam(node, (f, t) => resolveTag(ctx, f, t), opts);
    if (!param) return new Map();
    return queryParams(ctx, [param]);
  }

  // Fast path: an AND group of only conditions → one Plex query (params ANDed).
  if (node.combinator === "and" && node.children.every((c) => c.type === "condition")) {
    const params: string[] = [];
    for (const c of node.children as FilterCondition[]) {
      const p = await buildParam(c, (f, t) => resolveTag(ctx, f, t), opts);
      if (!p) return new Map(); // a tag value missing → AND yields nothing here
      params.push(p);
    }
    return queryParams(ctx, params);
  }

  const childMaps: Map<string, PlexItem>[] = [];
  for (const child of node.children) childMaps.push(await resolveNode(child, ctx));

  if (node.combinator === "or") {
    const out = new Map<string, PlexItem>();
    for (const m of childMaps) for (const [k, v] of m) out.set(k, v);
    return out;
  }
  // AND: intersect
  if (childMaps.length === 0) return queryParams(ctx, []);
  let acc = childMaps[0]!;
  for (let i = 1; i < childMaps.length; i++) {
    const next = childMaps[i]!;
    const inter = new Map<string, PlexItem>();
    for (const [k, v] of acc) if (next.has(k)) inter.set(k, v);
    acc = inter;
  }
  return acc;
}

type ChannelFilter = { mediaTypes?: string[]; filter?: FilterNode };

export type ResolveSource = { id: string; baseUrl: string; token: string };

/**
 * Resolve a candidate pool for a raw predicate tree across the source's enabled
 * libraries of the chosen content type(s). Movies query type=1; TV resolves to
 * episodes (type=4) via Plex's dotted advanced-filter syntax. De-duped by ratingKey.
 * Used by both channel resolution and the auto-lineup analyzer.
 */
export async function resolveFilter(
  prisma: PrismaClient,
  source: ResolveSource,
  mediaTypes: string[],
  tree: FilterNode | undefined,
  sort: string,
): Promise<PlexItem[]> {
  const libs = await prisma.mediaLibrary.findMany({
    where: { mediaSourceId: source.id, enabled: true, type: { in: mediaTypes } },
  });

  const out = new Map<string, PlexItem>();
  for (const lib of libs) {
    const isShow = lib.type !== "movie";
    const ctx: LibCtx = {
      baseUrl: source.baseUrl,
      token: source.token,
      sectionKey: lib.key,
      type: isShow ? 4 : 1,
      tv: isShow,
      sort,
      tagCache: new Map(),
    };
    const matched = tree ? await resolveNode(tree, ctx) : await queryParams(ctx, []);
    for (const [k, v] of matched) out.set(k, v);
  }
  return [...out.values()];
}

/** One membership source: a specific Plex playlist or collection (by ratingKey). */
export type MembershipSource = { type: "playlist" | "collection"; key: string; title?: string };

/**
 * Resolve a "membership" pool: the union of one or more Plex playlists / collections, in the order the
 * sources are listed (each in its own playlist/collection order), deduped by ratingKey (first occurrence
 * wins, so IN_ORDER preserves the source order). Containers (shows/seasons) are expanded to episodes by
 * the client. The guide is hydrated from the MediaItem cache — which already carries stream badges
 * (resolution / hdr / audio) from the media sync, so a membership channel matches filter-mode richness
 * with no extra Plex round-trip; anything not yet cached falls back to a batched Plex metadata fetch, and
 * self-heals on the next sync.
 */
export async function resolveMembership(
  prisma: PrismaClient,
  source: ResolveSource,
  sources: MembershipSource[],
): Promise<PlexItem[]> {
  // 1. Each source's leaf items, in source array order. A missing/deleted source resolves to [] rather
  //    than hard-failing the whole channel.
  const perSource = await Promise.all(
    sources.map((s) =>
      (s.type === "playlist"
        ? getPlaylistItems(source.baseUrl, source.token, s.key)
        : getCollectionItems(source.baseUrl, source.token, s.key)
      ).catch(() => [] as PlexItem[]),
    ),
  );

  // 2. Union + dedupe by ratingKey (first occurrence wins → preserves order for IN_ORDER).
  const ordered: PlexItem[] = [];
  const seen = new Set<string>();
  for (const items of perSource)
    for (const it of items)
      if (!seen.has(it.ratingKey)) {
        seen.add(it.ratingKey);
        ordered.push(it);
      }
  if (!ordered.length) return [];

  // 3. Hydrate the rich guide from the MediaItem cache; fall back to a Plex metadata fetch (with streams)
  //    for anything uncached; then the thin /items guide as a last resort (self-heals on next sync).
  const keys = ordered.map((i) => i.ratingKey);
  const cached = await prisma.mediaItem.findMany({
    where: { mediaSourceId: source.id, ratingKey: { in: keys } },
    select: { ratingKey: true, title: true, durationMs: true, year: true, airDate: true, guide: true },
  });
  const cachedByKey = new Map(cached.map((r) => [r.ratingKey, r]));

  const uncachedKeys = keys.filter((k) => !cachedByKey.has(k));
  const fetched = uncachedKeys.length ? await getMetadataByKeys(source.baseUrl, source.token, uncachedKeys) : [];
  const fetchedByKey = new Map(fetched.map((i) => [i.ratingKey, i]));
  const thinByKey = new Map(ordered.map((i) => [i.ratingKey, i]));

  return keys.map((key) => {
    const row = cachedByKey.get(key);
    if (row)
      return {
        ratingKey: row.ratingKey,
        title: row.title,
        durationMs: row.durationMs,
        year: row.year ?? undefined,
        originallyAvailableAt: row.airDate ?? undefined,
        guide: row.guide as unknown as GuideMeta,
      };
    return fetchedByKey.get(key) ?? thinByKey.get(key)!;
  });
}

/**
 * Resolve a channel's candidate pool — loads its (single) definition and delegates by kind: PREDICATE
 * (a metadata filter) to {@link resolveFilter}, MEMBERSHIP (Plex playlists / collections) to
 * {@link resolveMembership}. Ordering / strategy / weighting / scheduling downstream is source-agnostic.
 */
export async function resolveChannel(
  prisma: PrismaClient,
  channelId: string,
): Promise<PlexItem[]> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { definitions: { orderBy: { sortIndex: "asc" }, take: 1 }, mediaSource: true },
  });
  const source = channel?.mediaSource;
  const def = channel?.definitions[0];
  if (!channel || !source?.baseUrl || !def) return [];
  const src = { id: source.id, baseUrl: source.baseUrl, token: decryptToken(source.token) };

  if (def.kind === "MEMBERSHIP") {
    const sources = (def.sources as unknown as MembershipSource[] | null) ?? [];
    const pool = await resolveMembership(prisma, src, sources);
    // The membership pool arrives in source order (IN_ORDER). BY_AIR_DATE re-sorts here — filter mode
    // gets this from Plex's `sort=` param, which membership can't use. SHUFFLE is applied downstream.
    if (channel.ordering === "BY_AIR_DATE")
      return pool.sort((a, b) => (b.originallyAvailableAt ?? "").localeCompare(a.originallyAvailableAt ?? ""));
    return pool;
  }

  const filter = (def.plexFilter as unknown as ChannelFilter | null) ?? {};
  const mediaTypes = filter.mediaTypes?.length ? filter.mediaTypes : ["movie", "show"];
  const sort = channelSortParam(channel.ordering, channel.sortField, channel.sortDir);
  return resolveFilter(prisma, src, mediaTypes, filter.filter, sort);
}
