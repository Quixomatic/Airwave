import type { PrismaClient } from "@airwave/db";

import {
  type GuideMeta,
  type PlexItem,
  getCollectionItems,
  getFilterValues,
  getMetadataByKeys,
  getPlaylistItems,
  getSectionItemsRaw,
  getShowEpisodes,
} from "./client";
import { type FilterCondition, type FilterNode, buildParam, fieldMeta } from "./filter-fields";
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
  /** Skip the per-file Stream tree in the Plex response (lean reads that only need counts + artwork). */
  includeStreams: boolean;
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
  return toMap(
    await getSectionItemsRaw(ctx.baseUrl, ctx.token, ctx.sectionKey, ctx.type, params, ctx.sort, 800, ctx.includeStreams),
  );
}

/** Negation operators — "not X". For these, an unresolvable value means "exclude nothing", not "match nothing". */
const NEGATION_OPS = new Set(["isNot", "notContains", "notEquals"]);
const isNegation = (c: FilterCondition) => NEGATION_OPS.has(c.op);

/** Does this field resolve at all in this library type? An unknown field, or one whose `appliesTo` excludes
 *  this type (e.g. `duration` on TV, `network` on movies), does not. */
function fieldApplies(field: string, libType: "movie" | "show"): boolean {
  const meta = fieldMeta(field);
  if (!meta) return false;
  return !meta.appliesTo || meta.appliesTo.includes(libType);
}

/**
 * A resolved node is either a Map of matches OR `DROP` (null) meaning "this predicate/group can't be evaluated
 * in this library, so ignore it in the parent group". DROP is distinct from an empty Map: an empty Map means
 * "evaluated, matched nothing" (a real FALSE that wipes an AND), while DROP is the group identity — skip it.
 *
 * A predicate DROPs when it can't be a gate in this library: the field doesn't apply to this library type
 * (`duration` on TV), or its tag value isn't present AND the op is a negation (excluding an absent value
 * excludes nothing). A POSITIVE op whose value is absent matches NOTHING (empty), because you asked for a
 * value this library doesn't have. A group where every child DROPs itself DROPs; if the whole filter DROPs
 * for a library, that library contributes nothing (a filter with no gate it can apply → 0). This mirrors how
 * the Plex web UI treats a mixed filter across a movie + TV library. Verified: `scripts/probe-preset.ts`.
 */
type NodeResult = Map<string, PlexItem> | null;
const DROP: NodeResult = null;

async function resolveNode(node: FilterNode, ctx: LibCtx): Promise<NodeResult> {
  const libType = ctx.tv ? ("show" as const) : ("movie" as const);
  const opts = { libType };

  if (node.type === "condition") {
    if (!fieldApplies(node.field, libType)) return DROP; // not a gate in this library → ignore it
    const param = await buildParam(node, (f, t) => resolveTag(ctx, f, t), opts);
    if (!param) return isNegation(node) ? DROP : new Map(); // absent value: exclude-nothing vs match-nothing
    return queryParams(ctx, [param]);
  }

  // Fast path: an AND group of only conditions → one Plex query (params ANDed).
  if (node.combinator === "and" && node.children.every((c) => c.type === "condition")) {
    const params: string[] = [];
    for (const c of node.children as FilterCondition[]) {
      if (!fieldApplies(c.field, libType)) continue; // drop: not a gate here
      const p = await buildParam(c, (f, t) => resolveTag(ctx, f, t), opts);
      if (!p) {
        if (isNegation(c)) continue; // drop: excluding an absent value removes nothing
        return new Map(); // a POSITIVE required value is absent → the AND matches nothing
      }
      params.push(p);
    }
    return params.length ? queryParams(ctx, params) : DROP; // every gate dropped → group drops out
  }

  // General path: resolve each child, ignore the DROPs, then combine the rest.
  const childResults: NodeResult[] = [];
  for (const child of node.children) childResults.push(await resolveNode(child, ctx));
  const real = childResults.filter((r): r is Map<string, PlexItem> => r !== DROP);
  if (real.length === 0) return DROP; // nothing evaluable here → this group drops out of its parent

  if (node.combinator === "or") {
    const out = new Map<string, PlexItem>();
    for (const m of real) for (const [k, v] of m) out.set(k, v);
    return out;
  }
  // AND: intersect the real gates.
  let acc = real[0]!;
  for (let i = 1; i < real.length; i++) {
    const next = real[i]!;
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
  opts: { includeStreams?: boolean } = {},
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
      includeStreams: opts.includeStreams ?? true,
    };
    // A top-level DROP = the whole filter had no gate this library can apply → it contributes nothing.
    const matched = tree ? await resolveNode(tree, ctx) : await queryParams(ctx, []);
    if (matched) for (const [k, v] of matched) out.set(k, v);
  }
  return [...out.values()];
}

/** One membership source: a specific Plex playlist or collection (by ratingKey). */
export type MembershipSource = { type: "playlist" | "collection"; key: string; title?: string };

/**
 * Shared for MEMBERSHIP + MANUAL_ITEMS: take ordered leaf items (already expanded + in the desired order),
 * union + dedupe by ratingKey (first occurrence wins → preserves order for IN_ORDER), and hydrate each with
 * the rich guide from the MediaItem cache — which already carries stream badges (resolution / hdr / audio)
 * from the media sync, so these pools match filter-mode richness with no extra Plex round-trip. Anything not
 * yet cached falls back to a batched Plex metadata fetch (with streams), then the thin guide as a last
 * resort (self-heals on the next sync).
 */
async function unionAndHydrate(
  prisma: PrismaClient,
  source: ResolveSource,
  lists: PlexItem[][],
): Promise<PlexItem[]> {
  const ordered: PlexItem[] = [];
  const seen = new Set<string>();
  for (const items of lists)
    for (const it of items)
      if (!seen.has(it.ratingKey)) {
        seen.add(it.ratingKey);
        ordered.push(it);
      }
  if (!ordered.length) return [];

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
 * Resolve a "membership" pool: the union of one or more Plex playlists / collections, in the order the
 * sources are listed (each in its own playlist/collection order). Containers (shows/seasons) are expanded
 * to episodes by the client; the guide is hydrated from the cache (see {@link unionAndHydrate}).
 */
export async function resolveMembership(
  prisma: PrismaClient,
  source: ResolveSource,
  sources: MembershipSource[],
): Promise<PlexItem[]> {
  // Each source's leaf items, in source array order. A missing/deleted source resolves to [] rather than
  // hard-failing the whole channel.
  const perSource = await Promise.all(
    sources.map((s) =>
      (s.type === "playlist"
        ? getPlaylistItems(source.baseUrl, source.token, s.key)
        : getCollectionItems(source.baseUrl, source.token, s.key)
      ).catch(() => [] as PlexItem[]),
    ),
  );
  return unionAndHydrate(prisma, source, perSource);
}

/**
 * Resolve a "manual" pool: an explicit, ordered list of hand-picked ratingKeys. A `show` key expands LIVE
 * to its current episodes (so a new episode enters the pool on the next build/extend); `movie` / `episode`
 * keys are already leaves. Types come from the MediaItem cache (all library items are enriched there);
 * an uncached key is treated as a leaf and hydrated by {@link unionAndHydrate}. Same order/dedupe/guide
 * semantics as membership.
 */
export async function resolveManual(
  prisma: PrismaClient,
  source: ResolveSource,
  itemKeys: string[],
): Promise<PlexItem[]> {
  if (!itemKeys.length) return [];
  const rows = await prisma.mediaItem.findMany({
    where: { mediaSourceId: source.id, ratingKey: { in: itemKeys } },
    select: { ratingKey: true, type: true },
  });
  const typeByKey = new Map(rows.map((r) => [r.ratingKey, r.type]));

  const lists = await Promise.all(
    itemKeys.map((key): Promise<PlexItem[]> =>
      typeByKey.get(key) === "show"
        ? getShowEpisodes(source.baseUrl, source.token, key).catch(() => [] as PlexItem[])
        : // movie / episode (or uncached → treat as a leaf); the guide is filled in during hydration.
          Promise.resolve([{ ratingKey: key, title: "", durationMs: 0, guide: { title: "" } }]),
    ),
  );
  return unionAndHydrate(prisma, source, lists);
}

/** A resolved membership/manual pool arrives in its natural (source/pick) order = IN_ORDER. BY_AIR_DATE
 *  re-sorts it here — filter mode gets that from Plex's `sort=` param, which these paths can't use.
 *  SHUFFLE is applied downstream by the scheduler. */
function applyResolvedOrdering(pool: PlexItem[], ordering: string): PlexItem[] {
  if (ordering === "BY_AIR_DATE")
    return pool.sort((a, b) => (b.originallyAvailableAt ?? "").localeCompare(a.originallyAvailableAt ?? ""));
  return pool;
}

/**
 * Resolve a channel's candidate pool — loads its (single) definition and delegates by kind: PREDICATE
 * (a metadata filter) to {@link resolveFilter}, MEMBERSHIP (Plex playlists / collections) to
 * {@link resolveMembership}, MANUAL_ITEMS (hand-picked items) to {@link resolveManual}. Ordering /
 * strategy / weighting / scheduling downstream is source-agnostic.
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
    return applyResolvedOrdering(await resolveMembership(prisma, src, sources), channel.ordering);
  }

  if (def.kind === "MANUAL_ITEMS") {
    return applyResolvedOrdering(await resolveManual(prisma, src, def.manualItemKeys), channel.ordering);
  }

  const filter = (def.plexFilter as unknown as ChannelFilter | null) ?? {};
  const mediaTypes = filter.mediaTypes?.length ? filter.mediaTypes : ["movie", "show"];
  const sort = channelSortParam(channel.ordering, channel.sortField, channel.sortDir);
  return resolveFilter(prisma, src, mediaTypes, filter.filter, sort);
}
