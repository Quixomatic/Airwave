import type { PrismaClient } from "@airwave/db";

import { getLibraries } from "./client";

type ConnectedSource = { id: string; token: string; baseUrl: string | null };

/**
 * Sync the connected server's libraries into `MediaLibrary` rows (Overseerr-
 * style). New libraries are added enabled; existing ones keep their enabled
 * flag. Returns the current library list.
 */
export async function syncLibraries(prisma: PrismaClient, source: ConnectedSource) {
  if (!source.baseUrl) return [];
  const libs = await getLibraries(source.baseUrl, source.token);
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
