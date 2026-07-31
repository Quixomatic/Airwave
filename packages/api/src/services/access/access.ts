import type { PrismaClient } from "@ChannelGuide/db";

/**
 * Per-user access control (§7.13) — the config read/write brains, plus the resolver that Phase 2's REST
 * enforcement will use. Three levels: `allAccess` (everything, incl. future) → `UserPackageAccess.FULL`
 * (a whole package, incl. future channels) → `UserPackageAccess.PARTIAL` + `UserChannelAccess` (explicit
 * channels). Ungrouped channels (no package) are per-channel grants only. Admins bypass.
 */

/** A resolved access set: `"all"` (admins + all-access users — no filtering) or the exact channel ids. */
export type AccessSet = "all" | Set<string>;

export type PackageGrant = { packageId: string; mode: "FULL" | "PARTIAL" };

/** A channel as the access grid renders it. */
export type AccessChannel = { id: string; number: number; name: string; callsign: string | null };

/** The full package+channel catalog the grid needs, plus the user's current grants. */
export type UserAccess = {
  userId: string;
  role: string | null;
  allAccess: boolean;
  /** The user's package grants (empty when allAccess). */
  packages: PackageGrant[];
  /** The user's explicit channel grants (empty when allAccess). */
  channelIds: string[];
  /** Everything selectable, for the grid. */
  catalog: {
    packages: { id: string; key: string; name: string; icon: string | null; tint: string | null; channels: AccessChannel[] }[];
    ungrouped: AccessChannel[];
  };
};

const CHANNEL_SELECT = { id: true, number: true, name: true, callsign: true } as const;

/** Read a user's access config + the catalog to render the editor grid. */
export async function getUserAccess(prisma: PrismaClient, userId: string): Promise<UserAccess> {
  const [user, packages, ungrouped] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        allAccess: true,
        packageAccess: { select: { packageId: true, mode: true } },
        channelAccess: { select: { channelId: true } },
      },
    }),
    prisma.channelPackage.findMany({
      orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
      select: {
        id: true,
        key: true,
        name: true,
        icon: true,
        tint: true,
        channels: { orderBy: { number: "asc" }, select: CHANNEL_SELECT },
      },
    }),
    prisma.channel.findMany({ where: { packageId: null }, orderBy: { number: "asc" }, select: CHANNEL_SELECT }),
  ]);
  if (!user) throw new Error(`User ${userId} not found`);

  return {
    userId,
    role: user.role ?? null,
    allAccess: user.allAccess,
    packages: user.packageAccess.map((p) => ({ packageId: p.packageId, mode: p.mode })),
    channelIds: user.channelAccess.map((c) => c.channelId),
    catalog: { packages, ungrouped },
  };
}

export type SetUserAccessInput = {
  allAccess: boolean;
  /** Package grants (ignored when allAccess). */
  packages?: PackageGrant[];
  /** Explicit channel grants — for PARTIAL packages + ungrouped channels (ignored when allAccess). */
  channelIds?: string[];
};

/**
 * Replace a user's access config in one transaction (staging-style "apply once"). Clears the prior grant
 * rows and recreates them from the payload. When `allAccess` is true, grant rows are cleared entirely (they're
 * moot) — so toggling all-access back off later starts fresh (the UI pre-fills all-selected).
 */
export async function setUserAccess(
  prisma: PrismaClient,
  userId: string,
  input: SetUserAccessInput,
): Promise<{ ok: true }> {
  const packages = input.allAccess ? [] : (input.packages ?? []);
  const channelIds = input.allAccess ? [] : [...new Set(input.channelIds ?? [])];

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { allAccess: input.allAccess } }),
    prisma.userPackageAccess.deleteMany({ where: { userId } }),
    prisma.userChannelAccess.deleteMany({ where: { userId } }),
    ...(packages.length
      ? [prisma.userPackageAccess.createMany({ data: packages.map((p) => ({ userId, packageId: p.packageId, mode: p.mode })) })]
      : []),
    ...(channelIds.length
      ? [prisma.userChannelAccess.createMany({ data: channelIds.map((channelId) => ({ userId, channelId })) })]
      : []),
  ]);
  return { ok: true };
}

/** Whether an access set permits a channel (`"all"` → always). */
export function isChannelAllowed(access: AccessSet, channelId: string): boolean {
  return access === "all" || access.has(channelId);
}

/** Keep only the channel ids an access set permits (`"all"` → unchanged). */
export function filterAccessibleIds(ids: string[], access: AccessSet): string[] {
  return access === "all" ? ids : ids.filter((id) => access.has(id));
}

/**
 * Resolve what a user can actually see/play — the central check Phase 2's REST enforcement wires in.
 * Returns `"all"` (short-circuit: no filtering) for admins and all-access users; otherwise the concrete
 * set of accessible channel ids (FULL packages' channels ∪ explicit channel grants).
 */
export async function accessibleChannels(prisma: PrismaClient, userId: string): Promise<AccessSet> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      allAccess: true,
      packageAccess: { where: { mode: "FULL" }, select: { packageId: true } },
      channelAccess: { select: { channelId: true } },
    },
  });
  if (!user) return new Set(); // unknown user → nothing
  if (user.role === "admin" || user.allAccess) return "all";

  const ids = new Set(user.channelAccess.map((c) => c.channelId));
  const fullPkgIds = user.packageAccess.map((p) => p.packageId);
  if (fullPkgIds.length) {
    const chans = await prisma.channel.findMany({
      where: { packageId: { in: fullPkgIds } },
      select: { id: true },
    });
    for (const c of chans) ids.add(c.id);
  }
  return ids;
}
