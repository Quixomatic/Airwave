import type { PrismaClient } from "@airwave/db";

import type { AccessSet } from "./access/access";

/**
 * The channel packages that have at least one ENABLED channel the viewer can access — the TV guide
 * sidebar's filter list. Distinct from the admin tRPC `packages.list` (which returns ALL packages, incl.
 * empty ones, for management): a viewer only wants packages they can actually filter the guide to. Ordered
 * by the admin sort (`sortIndex`) then name, and carries each package's own icon + tint. `accessible` scopes
 * it: `"all"` counts every enabled channel; a Set counts only accessible ones and DROPS packages that end up
 * empty (a PARTIAL package with 0 granted channels, or one the viewer can't see at all) — access control §7.13.
 */
export async function listActivePackages(prisma: PrismaClient, accessible: AccessSet = "all") {
  const packages = await prisma.channelPackage.findMany({
    where: { channels: { some: { enabled: true } } },
    orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      icon: true,
      tint: true,
      // Enabled channel ids so the count reflects what the package's lens actually shows the viewer.
      channels: { where: { enabled: true }, select: { id: true } },
    },
  });
  return packages
    .map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      icon: p.icon,
      tint: p.tint,
      channelCount: accessible === "all" ? p.channels.length : p.channels.filter((c) => accessible.has(c.id)).length,
    }))
    .filter((p) => p.channelCount > 0);
}
