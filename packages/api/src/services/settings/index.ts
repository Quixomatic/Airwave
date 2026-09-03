import type { PrismaClient } from "@airwave/db";

/**
 * App-wide settings — a singleton row (`key = "global"`), mirroring the global bumper config. Get-or-create
 * so callers always get a row to read/patch. Add generic, non-per-entity settings as columns on `AppSettings`.
 */
const SINGLETON_KEY = "global";

export async function getAppSettings(prisma: PrismaClient) {
  return prisma.appSettings.upsert({
    where: { key: SINGLETON_KEY },
    create: { key: SINGLETON_KEY },
    update: {},
  });
}

export type AppSettingsPatch = {
  /** Max channels the AI lineup builder builds in parallel (1–16). */
  channelBuildConcurrency?: number;
  /** Max channels the lineup importer resolves/creates in parallel (1–16). */
  importConcurrency?: number;
  /** Max output tokens for the AI lineup planner's single design call (4000–128000). */
  plannerMaxOutputTokens?: number;
};

export async function updateAppSettings(prisma: PrismaClient, patch: AppSettingsPatch) {
  return prisma.appSettings.upsert({
    where: { key: SINGLETON_KEY },
    create: { key: SINGLETON_KEY, ...patch },
    update: patch,
  });
}
