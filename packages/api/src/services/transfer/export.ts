import type { PrismaClient } from "@airwave/db";

/**
 * Export the full lineup — every package + channel + their definitions — as a portable JSON blob that can
 * be imported into another Airwave instance. Deliberately OMITS everything instance-specific: the media
 * source binding, the materialized schedule, the media cache, and the schedule-pass cursor (all rebuilt on
 * the target). Channel→package links travel by the package's stable `key`; a definition's Plex library
 * travels by its human **title** (library keys differ per server) so the importer can remap it.
 *
 * The `plexFilter` on a PREDICATE definition is field+value based (matched by title against the target's
 * Plex), so it's portable. COLLECTION / PLAYLIST / MANUAL definitions reference per-server ids — they're
 * exported for completeness but the importer drops them.
 */
export const LINEUP_EXPORT_VERSION = 1 as const;

export type LineupExport = Awaited<ReturnType<typeof exportLineup>>;

export async function exportLineup(prisma: PrismaClient) {
  const [packages, channels, libraries] = await Promise.all([
    prisma.channelPackage.findMany({ orderBy: { sortIndex: "asc" } }),
    prisma.channel.findMany({
      orderBy: { number: "asc" },
      include: { definitions: { orderBy: { sortIndex: "asc" } }, package: { select: { key: true } } },
    }),
    prisma.mediaLibrary.findMany({ select: { mediaSourceId: true, key: true, title: true } }),
  ]);

  // (sourceId, libraryKey) → title, so a definition's library can travel by name.
  const libTitle = new Map<string, string>();
  for (const l of libraries) libTitle.set(`${l.mediaSourceId}:${l.key}`, l.title);

  return {
    version: LINEUP_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    packages: packages.map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      icon: p.icon,
      tint: p.tint,
      sortIndex: p.sortIndex,
    })),
    channels: channels.map((c) => ({
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
      packageKey: c.package?.key ?? null,
      definitions: c.definitions.map((d) => ({
        kind: d.kind,
        mode: d.mode,
        sortIndex: d.sortIndex,
        plexFilter: d.plexFilter,
        // Portable library reference — the importer resolves this back to a key on the target source.
        plexLibraryTitle: d.plexLibraryKey ? (libTitle.get(`${c.mediaSourceId}:${d.plexLibraryKey}`) ?? null) : null,
        plexCollectionKey: d.plexCollectionKey,
        plexPlaylistKey: d.plexPlaylistKey,
        manualItemKeys: d.manualItemKeys,
      })),
    })),
  };
}
