import type { PrismaClient } from "@ChannelGuide/db";

/**
 * The channel packages that have at least one ENABLED channel — the TV guide sidebar's filter
 * list. Distinct from the admin tRPC `packages.list` (which returns ALL packages, incl. empty
 * ones, for management): a viewer only wants packages they can actually filter the guide to.
 * Ordered by the admin sort (`sortIndex`) then name, and carries each package's own icon + tint
 * so the sidebar can render it in its own branding.
 */
export async function listActivePackages(prisma: PrismaClient) {
  const packages = await prisma.channelPackage.findMany({
    where: { channels: { some: { enabled: true } } },
    orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
    select: {
      id: true,
      key: true,
      name: true,
      icon: true,
      tint: true,
      // Count only ENABLED channels — the count must match what the package's lens actually shows.
      _count: { select: { channels: { where: { enabled: true } } } },
    },
  });
  return packages.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    icon: p.icon,
    tint: p.tint,
    channelCount: p._count.channels,
  }));
}
