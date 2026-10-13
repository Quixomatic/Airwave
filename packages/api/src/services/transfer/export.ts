import type { PrismaClient } from "@airwave/db";

import { getMembershipMemberKeys } from "../plex/client";
import type { ResolveSource } from "../plex/resolve";
import { decryptToken } from "../plex/token";
import { resolveExportItems } from "./export-items";
import { CURRENT_SCHEMA_VERSION, type ExportItem } from "./schema";

/**
 * Export the full lineup — every package + channel + their definitions — as a portable JSON blob that can
 * be imported into another Airwave instance. Deliberately OMITS everything instance-specific: the media
 * source binding, the materialized schedule, the media cache, and the schedule-pass cursor (all rebuilt on
 * the target). Channel→package links travel by the package's stable `key`; a definition's Plex library
 * travels by its human **title** (library keys differ per server) so the importer can remap it.
 *
 * PREDICATE defs travel by their field+value `plexFilter` (portable). MANUAL / MEMBERSHIP defs reference
 * per-server ids, so they also carry a resolved `items[]` of portable external GUIDs (schema 1.2) — a MANUAL
 * def's hand-picked keys, or a MEMBERSHIP container's DIRECT members (shows stay shows, so "whole show"
 * survives). The importer remaps those GUIDs to the target server's ratingKeys. Missing ids are backfilled
 * live from Plex at export time (see resolveExportItems), so an export is complete even without a re-sync.
 *
 * The envelope carries a semver `schemaVersion` (see `schema.ts`); the legacy integer `version` is gone.
 *
 * `selection` narrows the export to a SUBSET — one channel, one package (its channels), or a hand-picked set
 * — producing the SAME versioned document with fewer entries (what the single-channel / package share on the
 * marketplace needs). Omit it for the whole lineup.
 */
export type LineupExport = Awaited<ReturnType<typeof exportLineup>>;

export type ExportSelection = { channelNumbers?: number[]; packageKeys?: string[] };

export async function exportLineup(prisma: PrismaClient, selection: ExportSelection = {}) {
  const selecting = !!(selection.channelNumbers || selection.packageKeys);
  const channelWhere = selection.channelNumbers
    ? { number: { in: selection.channelNumbers } }
    : selection.packageKeys
      ? { package: { key: { in: selection.packageKeys } } }
      : {};

  const [allPackages, channels, libraries, sources] = await Promise.all([
    prisma.channelPackage.findMany({ orderBy: { sortIndex: "asc" } }),
    prisma.channel.findMany({
      where: channelWhere,
      orderBy: { number: "asc" },
      include: { definitions: { orderBy: { sortIndex: "asc" } }, package: { select: { key: true } } },
    }),
    prisma.mediaLibrary.findMany({ select: { mediaSourceId: true, key: true, title: true } }),
    prisma.mediaSource.findMany({ select: { id: true, baseUrl: true, token: true, machineIdentifier: true } }),
  ]);

  // Only emit packages referenced by the exported channels (plus any explicitly requested), so a subset
  // export stays self-contained without dragging in unrelated packages. Whole-lineup export emits all.
  const neededPkgKeys = new Set<string>(selection.packageKeys ?? []);
  for (const c of channels) if (c.package?.key) neededPkgKeys.add(c.package.key);
  const packages = selecting ? allPackages.filter((p) => neededPkgKeys.has(p.key)) : allPackages;

  // (sourceId, libraryKey) → title, so a definition's library can travel by name.
  const libTitle = new Map<string, string>();
  for (const l of libraries) libTitle.set(`${l.mediaSourceId}:${l.key}`, l.title);

  // sourceId → connection creds (for the export-time GUID backfill + membership member fetch) + the Plex
  // server id (so import can tell a same-server re-import, where MEMBERSHIP/MANUAL keys are still valid).
  const srcById = new Map<string, ResolveSource>();
  const serverIdById = new Map<string, string | null>();
  for (const s of sources) {
    if (s.baseUrl) srcById.set(s.id, { id: s.id, baseUrl: s.baseUrl, token: decryptToken(s.token) });
    serverIdById.set(s.id, s.machineIdentifier ?? null);
  }

  // Resolve the portable items[] for a MANUAL / MEMBERSHIP def (PREDICATE returns undefined).
  async function resolveItems(d: (typeof channels)[number]["definitions"][number], channelSourceId: string): Promise<ExportItem[] | undefined> {
    const src = srcById.get(channelSourceId);
    if (d.kind === "MANUAL_ITEMS") {
      // Even without live creds we can still emit cached ids; resolveExportItems skips the live backfill.
      return resolveExportItems(prisma, src ?? { id: channelSourceId, baseUrl: "", token: "" }, d.manualItemKeys);
    }
    if (d.kind === "MEMBERSHIP") {
      const membershipSources = (d.sources as Array<{ type: "playlist" | "collection"; key: string }> | null) ?? [];
      if (!src || membershipSources.length === 0) return [];
      // Each container's DIRECT members (unexpanded), in order, deduped across sources.
      const seen = new Set<string>();
      const memberKeys: string[] = [];
      for (const ms of membershipSources) {
        for (const m of await getMembershipMemberKeys(src.baseUrl, src.token, ms)) {
          if (!seen.has(m.ratingKey)) {
            seen.add(m.ratingKey);
            memberKeys.push(m.ratingKey);
          }
        }
      }
      return resolveExportItems(prisma, src, memberKeys);
    }
    return undefined; // PREDICATE
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    packages: packages.map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      icon: p.icon,
      tint: p.tint,
      sortIndex: p.sortIndex,
    })),
    channels: await Promise.all(
      channels.map(async (c) => ({
        number: c.number,
        name: c.name,
        callsign: c.callsign,
        description: c.description,
        icon: c.icon,
        tint: c.tint,
        enabled: c.enabled,
        sortIndex: c.sortIndex,
        ordering: c.ordering,
        sortField: c.sortField,
        sortDir: c.sortDir,
        bumperMode: c.bumperMode,
        // Portable scheduling config added in schema 1.1 (predates the original exporter, so it used to be
        // dropped): the grouping/rotation strategy, the specials/multi-part toggles, and the shuffle seed.
        strategy: c.strategy,
        excludeSpecials: c.excludeSpecials,
        keepMultiPartTogether: c.keepMultiPartTogether,
        shuffleSeed: c.shuffleSeed,
        // The Plex server this channel's media lives on — lets a same-server import keep MEMBERSHIP/MANUAL as-is.
        sourceServerId: serverIdById.get(c.mediaSourceId) ?? null,
        packageKey: c.package?.key ?? null,
        definitions: await Promise.all(
          c.definitions.map(async (d) => ({
            kind: d.kind,
            mode: d.mode,
            sortIndex: d.sortIndex,
            plexFilter: d.plexFilter,
            // Portable library reference — the importer resolves this back to a key on the target source.
            plexLibraryTitle: d.plexLibraryKey ? (libTitle.get(`${c.mediaSourceId}:${d.plexLibraryKey}`) ?? null) : null,
            // Original per-server refs kept for reference/name-match; portability rides on `items` (schema 1.2).
            sources: d.sources,
            manualItemKeys: d.manualItemKeys,
            items: await resolveItems(d, c.mediaSourceId),
          })),
        ),
      })),
    ),
  };
}
