import type { PrismaClient } from "@airwave/db";
import { randomUUID } from "node:crypto";

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

/**
 * The server's stable per-install fingerprint (a UUID on the AppSettings singleton). Generated once on first
 * read and never changed (immutable); self-healing so installs created before this existed backfill it. Cached
 * in module memory after the first read, so the hot path (the public /api/health handshake) does no DB lookup.
 * Warm it once at boot (see the server entry) so even the first request hits the cache.
 */
let cachedInstanceId: string | null = null;

export async function getInstanceId(prisma: PrismaClient): Promise<string> {
  if (cachedInstanceId) return cachedInstanceId;
  const settings = await getAppSettings(prisma);
  if (settings.instanceId) return (cachedInstanceId = settings.instanceId);
  const id = randomUUID();
  const updated = await prisma.appSettings.update({
    where: { key: SINGLETON_KEY },
    data: { instanceId: id },
  });
  return (cachedInstanceId = updated.instanceId ?? id);
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
