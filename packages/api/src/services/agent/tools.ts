import { Prisma, type PrismaClient } from "@ChannelGuide/db";

import { toAccentKey } from "../accents";
import { normalizeCallsign } from "../generator/callsign";
import { getFilterValues, type PlexItem } from "../plex/client";
import { fieldMeta, FILTER_FIELDS, OPS_FOR_KIND, type FilterNode } from "../plex/filter-fields";
import { resolveFilter } from "../plex/resolve";
import { channelSortParam } from "../plex/sort-fields";

/**
 * The channel-building agent's TOOLBOX — plain service functions the AI chat calls (wrapped as AI
 * SDK tools in `agent-tools.ts`) AND the future workflow-SDK job will call directly. Reads are safe;
 * writes stamp `aiGenerated=true` so they're cleanly reversible via `clearAiGenerated`.
 */

export type MediaType = "movie" | "show";

async function requireSource(prisma: PrismaClient, mediaSourceId: string) {
  const s = await prisma.mediaSource.findUnique({ where: { id: mediaSourceId } });
  if (!s?.baseUrl) throw new Error(`Media source ${mediaSourceId} not found or has no base URL`);
  return { id: s.id, baseUrl: s.baseUrl, token: s.token };
}

const asFilterNode = (f: unknown): FilterNode | undefined => (f ? (JSON.parse(JSON.stringify(f)) as FilterNode) : undefined);

/* ---------------- Discovery / grounding (read) --------------------------- */

export async function listMediaSources(prisma: PrismaClient) {
  const sources = await prisma.mediaSource.findMany({
    include: { libraries: { where: { enabled: true }, select: { key: true, title: true, type: true } } },
  });
  const withCounts = await Promise.all(
    sources.map(async (s) => {
      const counts = await prisma.mediaItem.groupBy({ by: ["type"], where: { mediaSourceId: s.id, available: true }, _count: true });
      return {
        id: s.id,
        name: s.name,
        libraries: s.libraries.map((l) => ({ name: l.title, type: l.type })),
        itemCounts: Object.fromEntries(counts.map((c) => [c.type, c._count])),
      };
    }),
  );
  return withCounts;
}

export async function libraryOverview(prisma: PrismaClient, mediaSourceId: string) {
  const counts = await prisma.mediaItem.groupBy({ by: ["type"], where: { mediaSourceId, available: true }, _count: true });
  const byType = Object.fromEntries(counts.map((c) => [c.type, c._count])) as Record<string, number>;
  return {
    movies: byType.movie ?? 0,
    shows: byType.show ?? 0,
    episodes: byType.episode ?? 0,
    note: "Use discover_field_values for real genres/studios/etc. (they live in the Plex library, not queryable here).",
  };
}

export function listFilterFields() {
  return FILTER_FIELDS.map((f) => ({
    field: f.field,
    label: f.label,
    kind: f.kind,
    operators: OPS_FOR_KIND[f.kind],
    hasDiscoverableValues: !!f.tagId,
    appliesTo: f.appliesTo,
  }));
}

export async function discoverFieldValues(prisma: PrismaClient, args: { mediaSourceId: string; mediaTypes: MediaType[]; field: string }) {
  const meta = fieldMeta(args.field);
  if (!meta?.tagId) return { field: args.field, values: [], note: "This field has no discoverable values (not a tag field)." };
  const source = await requireSource(prisma, args.mediaSourceId);
  const libs = await prisma.mediaLibrary.findMany({ where: { mediaSourceId: args.mediaSourceId, enabled: true, type: { in: args.mediaTypes } } });
  const titles = new Set<string>();
  for (const lib of libs) {
    const vals = await getFilterValues(source.baseUrl, source.token, lib.key, meta.plex);
    for (const v of vals) titles.add(v.title);
  }
  return { field: args.field, values: [...titles].sort((a, b) => a.localeCompare(b)) };
}

/** A single card in a preview: a SHOW (episodes aggregated + counted) or a MOVIE. */
export type PreviewEntry = {
  type: "show" | "movie";
  title: string;
  ratingKey: string;
  /** Plex art path (feed to the source image proxy). Show poster for shows, movie poster for movies. */
  thumbPath: string;
  /** Episodes matched (for a show) or 1 (movie). */
  count: number;
  year?: number;
  genres?: string[];
  contentRating?: string;
  criticRating?: number;
};

export type PreviewResult = {
  totalItems: number; // episodes + movies (what actually schedules)
  showCount: number;
  movieCount: number;
  entries: PreviewEntry[]; // shows (by episode count desc) then movies, capped
};

/** Group resolved Plex items into show/movie cards — the shared shape the admin preview + agent use. */
export function groupPreview(items: PlexItem[]): PreviewResult {
  const shows = new Map<string, PreviewEntry>();
  const movies: PreviewEntry[] = [];
  for (const it of items) {
    const g = it.guide;
    const showKey = g.showRatingKey;
    if (g.showTitle && showKey) {
      const ex = shows.get(showKey);
      if (ex) ex.count++;
      else
        shows.set(showKey, {
          type: "show",
          title: g.showTitle,
          ratingKey: showKey,
          thumbPath: `/library/metadata/${showKey}/thumb`,
          count: 1,
          genres: g.genres?.slice(0, 4),
          contentRating: g.contentRating,
          criticRating: g.criticRating,
        });
    } else {
      movies.push({
        type: "movie",
        title: it.title,
        ratingKey: it.ratingKey,
        thumbPath: `/library/metadata/${it.ratingKey}/thumb`,
        count: 1,
        year: it.year ?? g.year,
        genres: g.genres?.slice(0, 4),
        contentRating: g.contentRating,
        criticRating: g.criticRating,
      });
    }
  }
  const showEntries = [...shows.values()].sort((a, b) => b.count - a.count);
  return { totalItems: items.length, showCount: showEntries.length, movieCount: movies.length, entries: [...showEntries, ...movies].slice(0, 60) };
}

export async function previewFilter(
  prisma: PrismaClient,
  args: { mediaSourceId: string; mediaTypes: MediaType[]; filter?: FilterNode; sortField?: string; sortDir?: "asc" | "desc" },
) {
  const source = await requireSource(prisma, args.mediaSourceId);
  const sort = channelSortParam("SHUFFLE", args.sortField ?? "title", args.sortDir ?? "asc");
  const items = await resolveFilter(prisma, source, args.mediaTypes, asFilterNode(args.filter), sort);
  return groupPreview(items);
}

export async function searchTitles(prisma: PrismaClient, args: { mediaSourceId: string; mediaTypes: MediaType[]; query: string }) {
  const source = await requireSource(prisma, args.mediaSourceId);
  const tree: FilterNode = { type: "condition", field: "title", op: "contains", value: args.query };
  const items = await resolveFilter(prisma, source, args.mediaTypes, tree, channelSortParam("SHUFFLE", "title", "asc"));
  return groupPreview(items);
}

/* ---------------- Inspection (read) -------------------------------------- */

export async function listChannels(prisma: PrismaClient) {
  const rows = await prisma.channel.findMany({
    orderBy: { number: "asc" },
    select: { id: true, number: true, name: true, enabled: true, aiGenerated: true, package: { select: { id: true, name: true } } },
  });
  return rows;
}

export async function getChannel(prisma: PrismaClient, id: string) {
  const c = await prisma.channel.findUnique({
    where: { id },
    include: { definitions: { orderBy: { sortIndex: "asc" }, take: 1 }, package: { select: { id: true, name: true } } },
  });
  if (!c) throw new Error(`Channel ${id} not found`);
  const def = c.definitions[0];
  const pf = (def?.plexFilter as { mediaTypes?: string[]; filter?: FilterNode } | null) ?? {};
  return {
    id: c.id,
    number: c.number,
    name: c.name,
    enabled: c.enabled,
    ordering: c.ordering,
    sortField: c.sortField,
    sortDir: c.sortDir,
    icon: c.icon,
    tint: c.tint,
    description: c.description,
    package: c.package,
    aiGenerated: c.aiGenerated,
    mediaTypes: pf.mediaTypes ?? [],
    filter: pf.filter ?? null,
  };
}

export async function listPackages(prisma: PrismaClient) {
  const rows = await prisma.channelPackage.findMany({
    orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, aiGenerated: true, _count: { select: { channels: true } } },
  });
  return rows.map((p) => ({ id: p.id, name: p.name, description: p.description, aiGenerated: p.aiGenerated, channelCount: p._count.channels }));
}

export async function getPackage(prisma: PrismaClient, id: string) {
  const p = await prisma.channelPackage.findUnique({
    where: { id },
    include: { channels: { orderBy: { number: "asc" }, select: { id: true, number: true, name: true, enabled: true } } },
  });
  if (!p) throw new Error(`Package ${id} not found`);
  return { id: p.id, name: p.name, description: p.description, icon: p.icon, tint: p.tint, aiGenerated: p.aiGenerated, channels: p.channels };
}

/* ---------------- Channel writes (approval-gated in chat) ----------------- */

export type ChannelInput = {
  name: string;
  mediaSourceId: string;
  mediaTypes: MediaType[];
  filter?: FilterNode;
  ordering?: "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";
  sortField?: string;
  sortDir?: "asc" | "desc";
  packageId?: string | null;
  number?: number;
  callsign?: string | null;
  icon?: string | null;
  tint?: string | null;
  description?: string | null;
  enabled?: boolean;
};

export async function createChannel(prisma: PrismaClient, userId: string, input: ChannelInput) {
  const number = input.number ?? ((await prisma.channel.aggregate({ _max: { number: true } }))._max.number ?? 0) + 1;
  const plexFilter = { mediaTypes: input.mediaTypes, ...(input.filter ? { filter: JSON.parse(JSON.stringify(input.filter)) } : {}) };
  const c = await prisma.channel.create({
    data: {
      name: input.name,
      callsign: input.callsign ? normalizeCallsign(input.callsign) : null,
      number,
      mediaSourceId: input.mediaSourceId,
      ordering: input.ordering ?? "SHUFFLE",
      sortField: input.sortField ?? "title",
      sortDir: input.sortDir ?? "asc",
      packageId: input.packageId ?? null,
      icon: input.icon ?? null,
      tint: input.tint ? toAccentKey(input.tint) : null,
      description: input.description ?? null,
      enabled: input.enabled ?? true,
      createdById: userId,
      aiGenerated: true,
      definitions: { create: { kind: "PREDICATE", plexFilter: plexFilter as Prisma.InputJsonValue } },
    },
  });
  return { id: c.id, number };
}

/** Partial update — pass only the fields to change (covers number, package, enabled, filter, appearance…). */
export async function updateChannel(prisma: PrismaClient, id: string, patch: Partial<ChannelInput>) {
  const existing = await prisma.channel.findUnique({ where: { id }, include: { definitions: { orderBy: { sortIndex: "asc" }, take: 1 } } });
  if (!existing) throw new Error(`Channel ${id} not found`);

  const data: Prisma.ChannelUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.callsign !== undefined) data.callsign = patch.callsign ? normalizeCallsign(patch.callsign) : null;
  if (patch.number !== undefined) data.number = patch.number;
  if (patch.ordering !== undefined) data.ordering = patch.ordering;
  if (patch.sortField !== undefined) data.sortField = patch.sortField;
  if (patch.sortDir !== undefined) data.sortDir = patch.sortDir;
  if (patch.packageId !== undefined) data.package = patch.packageId ? { connect: { id: patch.packageId } } : { disconnect: true };
  if (patch.icon !== undefined) data.icon = patch.icon;
  if (patch.tint !== undefined) data.tint = patch.tint ? toAccentKey(patch.tint) : null;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.enabled !== undefined) data.enabled = patch.enabled;

  // If filter / mediaTypes changed, rewrite the definition's plexFilter.
  if (patch.filter !== undefined || patch.mediaTypes !== undefined) {
    const def = existing.definitions[0];
    const cur = (def?.plexFilter as { mediaTypes?: MediaType[]; filter?: FilterNode } | null) ?? {};
    const mediaTypes = patch.mediaTypes ?? cur.mediaTypes ?? ["movie", "show"];
    const filter = patch.filter !== undefined ? patch.filter : cur.filter;
    const plexFilter = { mediaTypes, ...(filter ? { filter: JSON.parse(JSON.stringify(filter)) } : {}) } as Prisma.InputJsonValue;
    if (def) await prisma.channelDefinition.update({ where: { id: def.id }, data: { plexFilter } });
    else await prisma.channelDefinition.create({ data: { channelId: id, kind: "PREDICATE", plexFilter } });
  }

  await prisma.channel.update({ where: { id }, data });
  return { id };
}

export async function deleteChannel(prisma: PrismaClient, id: string) {
  await prisma.channel.delete({ where: { id } });
  return { id, deleted: true };
}

/** Bulk patch (only `packageId` / `enabled`) across many channels — for organizing / the workflow. */
export async function updateChannels(prisma: PrismaClient, ids: string[], patch: { packageId?: string | null; enabled?: boolean }) {
  const data: Prisma.ChannelUncheckedUpdateManyInput = {};
  if (patch.packageId !== undefined) data.packageId = patch.packageId;
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  const res = await prisma.channel.updateMany({ where: { id: { in: ids } }, data });
  return { updated: res.count };
}

export async function renumberChannels(prisma: PrismaClient, mapping: { channelId: string; number: number }[]) {
  await prisma.$transaction(mapping.map((m) => prisma.channel.update({ where: { id: m.channelId }, data: { number: m.number } })));
  return { updated: mapping.length };
}

/* ---------------- Package writes (approval-gated in chat) ----------------- */

async function uniquePackageKey(prisma: PrismaClient, name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "package";
  let key = base;
  for (let i = 2; await prisma.channelPackage.findUnique({ where: { key } }); i++) key = `${base}-${i}`;
  return key;
}

export async function createPackage(prisma: PrismaClient, input: { name: string; description?: string | null; icon?: string | null; tint?: string | null }) {
  const key = await uniquePackageKey(prisma, input.name);
  const sortIndex = ((await prisma.channelPackage.aggregate({ _max: { sortIndex: true } }))._max.sortIndex ?? 0) + 1;
  const p = await prisma.channelPackage.create({
    data: {
      key,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      tint: input.tint ? toAccentKey(input.tint) : null,
      sortIndex,
      aiGenerated: true,
    },
  });
  return { id: p.id };
}

export async function updatePackage(prisma: PrismaClient, id: string, patch: { name?: string; description?: string | null; icon?: string | null; tint?: string | null }) {
  const data: Prisma.ChannelPackageUpdateInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.icon !== undefined) data.icon = patch.icon;
  if (patch.tint !== undefined) data.tint = patch.tint ? toAccentKey(patch.tint) : null;
  await prisma.channelPackage.update({ where: { id }, data });
  return { id };
}

export async function deletePackage(prisma: PrismaClient, id: string) {
  await prisma.channel.updateMany({ where: { packageId: id }, data: { packageId: null } });
  await prisma.channelPackage.delete({ where: { id } });
  return { id, deleted: true };
}

/* ---------------- Cleanup ------------------------------------------------- */

/** One-shot undo of AI-made rows — deletes channels and/or packages flagged `aiGenerated`. */
export async function clearAiGenerated(prisma: PrismaClient, scope: "channels" | "packages" | "both") {
  let channels = 0;
  let packages = 0;
  if (scope === "channels" || scope === "both") channels = (await prisma.channel.deleteMany({ where: { aiGenerated: true } })).count;
  if (scope === "packages" || scope === "both") {
    await prisma.channel.updateMany({ where: { package: { aiGenerated: true } }, data: { packageId: null } });
    packages = (await prisma.channelPackage.deleteMany({ where: { aiGenerated: true } })).count;
  }
  return { channelsDeleted: channels, packagesDeleted: packages };
}
