import type { PrismaClient } from "@ChannelGuide/db";

import { LINEUP_EXPORT_VERSION } from "./export";

/**
 * The shape of an uploaded lineup file (produced by `exportLineup`). Kept structural + tolerant — an
 * older/other instance may omit fields. Validation of the envelope happens at the router (zod); here we
 * only read what we need.
 */
export type ImportedDefinition = {
  kind: string; // "PREDICATE" | "PLEX_COLLECTION" | "PLEX_PLAYLIST" | "MANUAL_ITEMS"
  mode?: string;
  sortIndex?: number;
  plexFilter?: unknown;
  plexLibraryTitle?: string | null;
};
export type ImportedChannel = {
  number: number;
  name: string;
  callsign?: string | null;
  description?: string | null;
  icon?: string | null;
  tint?: string | null;
  enabled?: boolean;
  sortIndex?: number;
  ordering?: string;
  sortField?: string;
  sortDir?: string;
  bumperMode?: string;
  packageKey?: string | null;
  definitions?: ImportedDefinition[];
};
export type ImportedPackage = {
  key: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  tint?: string | null;
  sortIndex?: number;
};
export type ImportedLineup = {
  version: number;
  exportedAt?: string;
  packages: ImportedPackage[];
  channels: ImportedChannel[];
};

/** Per-channel staging annotation — what will happen to this channel if imported. */
export type ChannelPreview = {
  number: number;
  name: string;
  callsign: string | null;
  /** Definition kinds that will be dropped (collections/playlists/manual — per-server, not portable). */
  droppedKinds: string[];
  /** No PREDICATE definition survives → the channel would have an empty pool, so it imports DISABLED. */
  willBeDisabled: boolean;
  /** The channel's number is already taken on this instance → it'll be reassigned to the next free one. */
  numberInUse: boolean;
  /** A predicate filter is scoped to a library this instance doesn't have → it falls back to all libraries. */
  libraryUnmatched: boolean;
};

export type PackagePreview = {
  key: string;
  name: string;
  icon: string | null;
  tint: string | null;
  /** A package with this key already exists here → it'll be reused (channels added to it). */
  exists: boolean;
  channels: ChannelPreview[];
};

export type ImportPreview = {
  version: number;
  supported: boolean; // version we understand
  source: { id: string; name: string; ready: boolean } | null;
  packages: PackagePreview[];
  /** Channels with no package in the file — grouped for selection under "Ungrouped". */
  ungrouped: ChannelPreview[];
  totals: { packages: number; channels: number };
};

const UNGROUPED = "__ungrouped__";

/**
 * Annotate an uploaded lineup against THIS instance, without writing anything — powers the staging screen
 * (pick which packages/channels to import). Flags per channel: dropped non-portable definitions, whether it
 * would import disabled (no predicate left), number collisions (reassigned on import), and unmatched
 * libraries (fall back to all).
 */
export async function previewImport(
  prisma: PrismaClient,
  data: ImportedLineup,
  targetSourceId: string,
): Promise<ImportPreview> {
  const source = await prisma.mediaSource.findUnique({
    where: { id: targetSourceId },
    select: { id: true, name: true, enabled: true, baseUrl: true, _count: { select: { mediaItems: true } } },
  });
  const [existingNumbers, existingKeys, libraries] = await Promise.all([
    prisma.channel.findMany({ select: { number: true } }),
    prisma.channelPackage.findMany({ select: { key: true } }),
    source ? prisma.mediaLibrary.findMany({ where: { mediaSourceId: targetSourceId }, select: { title: true } }) : Promise.resolve([]),
  ]);
  const numberSet = new Set(existingNumbers.map((c) => c.number));
  const keySet = new Set(existingKeys.map((p) => p.key));
  const libTitles = new Set(libraries.map((l) => l.title.toLowerCase()));

  const annotate = (c: ImportedChannel): ChannelPreview => {
    const defs = c.definitions ?? [];
    const predicate = defs.filter((d) => d.kind === "PREDICATE");
    const droppedKinds = defs.filter((d) => d.kind !== "PREDICATE").map((d) => d.kind);
    const libraryUnmatched = predicate.some(
      (d) => d.plexLibraryTitle != null && !libTitles.has(d.plexLibraryTitle.toLowerCase()),
    );
    return {
      number: c.number,
      name: c.name,
      callsign: c.callsign ?? null,
      droppedKinds,
      willBeDisabled: predicate.length === 0,
      numberInUse: numberSet.has(c.number),
      libraryUnmatched,
    };
  };

  // Group channels by package key (null → ungrouped).
  const byPkg = new Map<string, ImportedChannel[]>();
  for (const c of data.channels) {
    const k = c.packageKey ?? UNGROUPED;
    (byPkg.get(k) ?? byPkg.set(k, []).get(k)!).push(c);
  }

  const packages: PackagePreview[] = data.packages.map((p) => ({
    key: p.key,
    name: p.name,
    icon: p.icon ?? null,
    tint: p.tint ?? null,
    exists: keySet.has(p.key),
    channels: (byPkg.get(p.key) ?? []).map(annotate),
  }));
  const ungrouped = (byPkg.get(UNGROUPED) ?? []).map(annotate);

  return {
    version: data.version,
    supported: data.version === LINEUP_EXPORT_VERSION,
    source: source ? { id: source.id, name: source.name, ready: source.enabled && !!source.baseUrl && source._count.mediaItems > 0 } : null,
    packages,
    ungrouped,
    totals: { packages: data.packages.length, channels: data.channels.length },
  };
}
