import type { PrismaClient } from "@ChannelGuide/db";

import { type PlexItem, getFilterValues, getSectionItemsRaw } from "./client";
import { type FilterCondition, type FilterNode, buildParam } from "./filter-fields";

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

/**
 * Resolve a channel's candidate pool across all enabled libraries of the chosen
 * content type(s), applying the predicate tree. Items are de-duped by ratingKey.
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

  const filter = (def.plexFilter as unknown as ChannelFilter | null) ?? {};
  const mediaTypes = filter.mediaTypes?.length ? filter.mediaTypes : ["movie", "show"];
  const tree = filter.filter;

  const libs = await prisma.mediaLibrary.findMany({
    where: { mediaSourceId: source.id, enabled: true, type: { in: mediaTypes } },
  });
  // Stable sort only — the schedule engine owns deterministic ordering (seeded
  // shuffle / by-air-date). A stable Plex sort also keeps the candidate pool
  // deterministic under the query size cap (a `random` sort would return a
  // different subset each call).
  const sort = channel.ordering === "BY_AIR_DATE" ? "originallyAvailableAt" : "titleSort";

  const out = new Map<string, PlexItem>();
  for (const lib of libs) {
    const isShow = lib.type !== "movie";
    const ctx: LibCtx = {
      baseUrl: source.baseUrl,
      token: source.token,
      sectionKey: lib.key,
      type: isShow ? 4 : 1, // TV resolves to episodes directly via dotted filters
      tv: isShow,
      sort,
      tagCache: new Map(),
    };
    const matched = tree ? await resolveNode(tree, ctx) : await queryParams(ctx, []);
    for (const [k, v] of matched) out.set(k, v);
  }
  return [...out.values()];
}
