import type { PrismaClient } from "@airwave/db";

import { getSharedUsers } from "./client";
import { decryptToken } from "./token";

type ConnectedSource = {
  token: string;
  clientIdentifier: string | null;
  machineIdentifier: string | null;
};

/**
 * Import the users the admin's Plex server is shared with as Airwave
 * Viewer accounts (matched by Plex email). Idempotent — existing emails are
 * skipped. Owner-created / env-seeded admins are untouched. This is the
 * explicit "Import Plex Users" action (Overseerr-style), not automatic.
 */
export async function importPlexUsers(prisma: PrismaClient, source: ConnectedSource) {
  if (!source.machineIdentifier || !source.clientIdentifier) {
    throw new Error("The connected Plex server is missing its identifiers — reconnect it.");
  }

  const shared = await getSharedUsers(
    source.clientIdentifier,
    decryptToken(source.token),
    source.machineIdentifier,
  );

  let imported = 0;
  let skipped = 0;
  for (const u of shared) {
    if (!u.email) {
      skipped++;
      continue;
    }
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: u.email,
        name: u.username,
        emailVerified: true,
        role: "user",
      },
    });
    imported++;
  }

  return { imported, skipped, total: shared.length };
}
