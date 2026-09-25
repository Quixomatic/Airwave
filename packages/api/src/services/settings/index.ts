import type { PrismaClient } from "@airwave/db";
import { randomUUID } from "node:crypto";
import { adjectives, animals, colors, uniqueNamesGenerator } from "unique-names-generator";

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

/**
 * The server's friendly DISPLAY name (e.g. "Sapphire Vole - Airwave Server"). Unlike the immutable
 * `instanceId`, this is a human-facing label the admin can change to anything in General settings. It's seeded
 * once with a generated name (same word-pair approach as the Airwave Cloud subdomain generator, but title-cased
 * with spaces and an "- Airwave Server" suffix), self-heals if missing, and is cached in memory for the
 * /api/identity hot path (the cache is refreshed whenever it's changed via updateAppSettings). Warm it once at
 * boot alongside getInstanceId.
 */
let cachedServerName: string | null = null;

/** Generate a friendly default like "Sapphire Vole - Airwave Server" (color/adjective + animal + suffix). */
export function genServerName(): string {
  const pair = uniqueNamesGenerator({
    dictionaries: [[...colors, ...adjectives], animals],
    separator: " ",
    length: 2,
    style: "capital",
  });
  return `${pair} - Airwave Server`;
}

export async function getServerName(prisma: PrismaClient): Promise<string> {
  if (cachedServerName) return cachedServerName;
  const settings = await getAppSettings(prisma);
  if (settings.serverName) return (cachedServerName = settings.serverName);
  const name = genServerName();
  const updated = await prisma.appSettings.update({
    where: { key: SINGLETON_KEY },
    data: { serverName: name },
  });
  return (cachedServerName = updated.serverName ?? name);
}

export type AppSettingsPatch = {
  /** Friendly display name for this server (1–60 chars). */
  serverName?: string;
  /** Max channels the AI lineup builder builds in parallel (1–16). */
  channelBuildConcurrency?: number;
  /** Max channels the lineup importer resolves/creates in parallel (1–16). */
  importConcurrency?: number;
  /** Max output tokens for the AI lineup planner's single design call (4000–128000). */
  plannerMaxOutputTokens?: number;
};

export async function updateAppSettings(prisma: PrismaClient, patch: AppSettingsPatch) {
  const updated = await prisma.appSettings.upsert({
    where: { key: SINGLETON_KEY },
    create: { key: SINGLETON_KEY, ...patch },
    update: patch,
  });
  // Keep the /api/identity memory cache in sync when the display name changes.
  if (patch.serverName !== undefined) cachedServerName = updated.serverName ?? null;
  return updated;
}
