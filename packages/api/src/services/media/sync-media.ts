import type { PrismaClient } from "@airwave/db";

import { type PlexItem, getAllSectionItems } from "../plex/client";
import { decryptToken } from "../plex/token";
import { type SyncProgress, toMediaItemData } from "./media-item";

/** Full upsert (refresh) of a batch of items, each with an optional parent-show id. */
export async function upsertMany(
  prisma: PrismaClient,
  mediaSourceId: string,
  entries: Array<{ item: PlexItem; parentId: string | null }>,
  report?: (done: number, total: number) => void,
): Promise<void> {
  const now = new Date();
  const chunk = 20;
  for (let i = 0; i < entries.length; i += chunk) {
    await prisma.$transaction(
      entries.slice(i, i + chunk).map(({ item, parentId }) => {
        const data = toMediaItemData(mediaSourceId, item, parentId);
        return prisma.mediaItem.upsert({
          where: { mediaSourceId_ratingKey: { mediaSourceId, ratingKey: item.ratingKey } },
          create: data,
          update: { ...data, available: true, lastSyncedAt: now },
        });
      }),
    );
    report?.(Math.min(i + chunk, entries.length), entries.length);
  }
}

/** Upsert shows and return a `showRatingKey → mediaItemId` map for linking episodes. */
export async function upsertShows(
  prisma: PrismaClient,
  mediaSourceId: string,
  shows: PlexItem[],
): Promise<Map<string, string>> {
  const now = new Date();
  const map = new Map<string, string>();
  const chunk = 20;
  for (let i = 0; i < shows.length; i += chunk) {
    const rows = await prisma.$transaction(
      shows.slice(i, i + chunk).map((item) => {
        const data = toMediaItemData(mediaSourceId, item, null);
        return prisma.mediaItem.upsert({
          where: { mediaSourceId_ratingKey: { mediaSourceId, ratingKey: item.ratingKey } },
          create: data,
          update: { ...data, available: true, lastSyncedAt: now },
          select: { id: true, ratingKey: true },
        });
      }),
    );
    for (const r of rows) map.set(r.ratingKey, r.id);
  }
  return map;
}

export type SyncResult = { libraries: number; shows: number; items: number; removed: number };

/**
 * Full refresh of the metadata cache for a source's enabled libraries. Builds the
 * show hierarchy (shows upserted first, then episodes linked to their parent show);
 * movies are standalone. Also does **removal detection**: anything not touched this
 * pass (its `lastSyncedAt` predates the scan) is flagged `available = false` rather
 * than deleted, so schedules built on now-removed media still render.
 */
export async function syncMediaItems(
  prisma: PrismaClient,
  sourceId: string,
  onProgress?: SyncProgress,
): Promise<SyncResult> {
  const source = await prisma.mediaSource.findUnique({
    where: { id: sourceId },
    include: { libraries: { where: { enabled: true } } },
  });
  if (!source?.baseUrl) throw new Error("Source is not connected.");
  const { baseUrl } = source;
  const token = decryptToken(source.token);
  const scanStart = new Date();

  // Per-source sync state — the HONEST "ready" signal (drives the gate, the source badge, and the
  // onboarding spinner). Set here so it's correct no matter who triggered the sync (scheduled job,
  // manual run, or on-connect). NOTE: the 5-min recently-added scan calls a DIFFERENT function
  // (syncRecentlyAdded) and deliberately never touches this, so a partial scan can't fake "synced".
  //
  // CRUCIAL: only show "syncing" for the FIRST sync (never/failed → syncing → synced). The metadata-sync
  // job re-runs nightly; a routine re-sync of an ALREADY-synced source must NOT regress it to "syncing" —
  // that would drop it out of "ready" and block channel creation during every refresh. It stays "synced"
  // throughout; live re-sync progress is surfaced separately via the job's own progress on the source page.
  const firstSync = source.syncStatus !== "synced";
  if (firstSync) {
    await prisma.mediaSource.update({
      where: { id: source.id },
      data: { syncStatus: "syncing", lastSyncError: null },
    });
  }

  try {
    let shows = 0;
    let items = 0;
    for (const lib of source.libraries) {
      onProgress?.({ current: 0, total: 0, label: `Fetching ${lib.title}…` });
      if (lib.type === "show") {
        const showItems = await getAllSectionItems(baseUrl, token, lib.key, 2);
        const showIds = await upsertShows(prisma, source.id, showItems);
        shows += showItems.length;

        const episodes = await getAllSectionItems(baseUrl, token, lib.key, 4);
        await upsertMany(
          prisma,
          source.id,
          episodes.map((item) => ({
            item,
            parentId: item.guide.showRatingKey
              ? (showIds.get(item.guide.showRatingKey) ?? null)
              : null,
          })),
          (done, total) => onProgress?.({ current: done, total, label: lib.title }),
        );
        items += episodes.length;
      } else {
        const movies = await getAllSectionItems(baseUrl, token, lib.key, 1);
        await upsertMany(
          prisma,
          source.id,
          movies.map((item) => ({ item, parentId: null })),
          (done, total) => onProgress?.({ current: done, total, label: lib.title }),
        );
        items += movies.length;
      }
    }

    // Removal detection: anything not refreshed this pass is gone from the server.
    const { count: removed } = await prisma.mediaItem.updateMany({
      where: { mediaSourceId: source.id, available: true, lastSyncedAt: { lt: scanStart } },
      data: { available: false },
    });

    // A full sync COMPLETED — this is the only place that marks a source "synced".
    await prisma.mediaSource.update({
      where: { id: source.id },
      data: { syncStatus: "synced", lastSyncedAt: new Date(), lastSyncError: null },
    });

    return { libraries: source.libraries.length, shows, items, removed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Only regress to "failed" if this was the FIRST sync (there's genuinely no usable media yet). A failed
    // RE-sync of an already-synced source keeps its "synced" state (the previously-cached media is still
    // there, so it stays "ready") but records the error so the UI can surface a warning.
    await prisma.mediaSource
      .update({
        where: { id: source.id },
        data: { syncStatus: firstSync ? "failed" : "synced", lastSyncError: message.slice(0, 500) },
      })
      .catch(() => {});
    throw err;
  }
}
