import type { PrismaClient } from "@airwave/db";

import { getLibraries } from "./client";
import { decryptToken } from "./token";

type ConnectedSource = { id: string; token: string; baseUrl: string | null };

/**
 * Sync the connected server's libraries into `MediaLibrary` rows (Overseerr-
 * style). New libraries are added enabled; existing ones keep their enabled
 * flag. Returns the current library list.
 */
export async function syncLibraries(prisma: PrismaClient, source: ConnectedSource) {
  if (!source.baseUrl) return [];
  const libs = await getLibraries(source.baseUrl, decryptToken(source.token));
  const now = new Date();
  for (const lib of libs) {
    await prisma.mediaLibrary.upsert({
      where: { mediaSourceId_key: { mediaSourceId: source.id, key: lib.key } },
      create: {
        mediaSourceId: source.id,
        key: lib.key,
        title: lib.title,
        type: lib.type,
        lastScanAt: now,
      },
      update: { title: lib.title, type: lib.type, lastScanAt: now },
    });
  }
  return prisma.mediaLibrary.findMany({
    where: { mediaSourceId: source.id },
    orderBy: { title: "asc" },
  });
}

/** Consecutive failed presence polls before `library-health` auto-disables a vanished library. */
export const MISSING_POLL_THRESHOLD = 3;

/**
 * Library-health reconcile (issue #36): a cheap presence check that auto-disables a library which has
 * vanished from the Plex server, and re-enables it if it comes back — so the heavy jobs (metadata-sync,
 * library-scan, schedule builds) never query a dead section key and 404. Only touches a library the SYSTEM
 * manages (`autoDisabled`); a library a user disabled by hand stays off and is left alone.
 *
 * Per poll, only when the library-list call SUCCEEDED and returned a non-empty set (a failed/empty call is
 * treated as "can't tell" — we do nothing, so a brief Plex/network blip never mass-disables libraries):
 *  - present   → reset `missingPolls`, and if WE auto-disabled it, re-enable it (self-heal);
 *  - absent     → bump `missingPolls`, and once it reaches the threshold, disable it and mark `autoDisabled`.
 */
export async function reconcileLibraryHealth(prisma: PrismaClient, source: ConnectedSource) {
  if (!source.baseUrl) return;
  let plexLibs: Awaited<ReturnType<typeof getLibraries>>;
  try {
    plexLibs = await getLibraries(source.baseUrl, decryptToken(source.token));
  } catch {
    return; // source unreachable / list call failed — touch nothing.
  }
  if (plexLibs.length === 0) return; // a 200 with no libraries is suspicious; never mass-disable on it.

  const present = new Set(plexLibs.map((l) => l.key));
  const stored = await prisma.mediaLibrary.findMany({ where: { mediaSourceId: source.id } });
  for (const lib of stored) {
    if (present.has(lib.key)) {
      // Seen this poll: clear the miss counter, and heal a library WE auto-disabled.
      if (lib.missingPolls !== 0 || lib.autoDisabled) {
        await prisma.mediaLibrary.update({
          where: { id: lib.id },
          data: { missingPolls: 0, ...(lib.autoDisabled ? { enabled: true, autoDisabled: false } : {}) },
        });
      }
    } else {
      // Missing this poll. Once it's already auto-disabled or has reached the threshold there's nothing
      // left to do — stop counting (keeps `missingPolls` capped at the threshold and avoids a pointless
      // write every poll while a library stays gone).
      if (lib.autoDisabled || lib.missingPolls >= MISSING_POLL_THRESHOLD) continue;
      const next = lib.missingPolls + 1;
      const disableNow = next >= MISSING_POLL_THRESHOLD && lib.enabled;
      await prisma.mediaLibrary.update({
        where: { id: lib.id },
        data: { missingPolls: next, ...(disableNow ? { enabled: false, autoDisabled: true } : {}) },
      });
    }
  }
}
