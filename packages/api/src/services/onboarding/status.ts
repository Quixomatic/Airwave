import type { PrismaClient } from "@airwave/db";

/**
 * Onboarding progress for the sidebar "Get set up" checklist. Computed LIVE from the data (no stored
 * progress table) so it's always accurate AND self-healing: complete it and the card hides; delete your
 * source or all your channels later and the relevant step un-ticks and the card comes back on its own.
 *
 * The `sync` step is tri-state (never/syncing/synced/failed) so the checklist row can show a live spinner
 * while a first sync is running — it reads the same honest MediaSource.syncStatus the gate uses.
 */
export type OnboardingSync = "none" | "syncing" | "synced" | "failed";

export type OnboardingStatus = {
  hasSource: boolean; // a media server is connected (enabled + resolved baseUrl)
  sync: OnboardingSync; // best sync state across connected sources
  hasChannel: boolean;
  hasPackage: boolean;
  hasImportedUsers: boolean; // at least one non-owner user (imported Plex friend / added viewer)
  /** How many of the 5 steps are complete (sync counts only when fully "synced"). */
  doneCount: number;
  total: number;
};

export async function getOnboardingStatus(prisma: PrismaClient): Promise<OnboardingStatus> {
  const [sources, channelCount, packageCount, otherUserCount] = await Promise.all([
    prisma.mediaSource.findMany({
      where: { enabled: true, baseUrl: { not: null } },
      select: { syncStatus: true },
    }),
    prisma.channel.count(),
    prisma.channelPackage.count(),
    prisma.user.count({ where: { role: { not: "admin" } } }),
  ]);

  const statuses = new Set(sources.map((s) => s.syncStatus));
  const sync: OnboardingSync = statuses.has("synced")
    ? "synced"
    : statuses.has("syncing")
      ? "syncing"
      : statuses.has("failed")
        ? "failed"
        : "none";

  const hasSource = sources.length > 0;
  const hasChannel = channelCount > 0;
  const hasPackage = packageCount > 0;
  const hasImportedUsers = otherUserCount > 0;

  const doneCount = [hasSource, sync === "synced", hasChannel, hasPackage, hasImportedUsers].filter(Boolean).length;

  return { hasSource, sync, hasChannel, hasPackage, hasImportedUsers, doneCount, total: 5 };
}
