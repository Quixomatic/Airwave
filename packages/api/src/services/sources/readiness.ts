import type { PrismaClient } from "@airwave/db";

/**
 * The SINGLE definition of "is a source ready to build from" — connected to a media server AND a full
 * metadata sync has COMPLETED. Replaces the old ad-hoc checks scattered across channel-create, import,
 * and the AI lineup job (which variously used `mediaItems > 0` — true mid-sync or after a partial 5-min
 * scan — or just "any enabled source exists"). Everything gates through here now, so "ready" means one
 * honest thing everywhere. Backed by `MediaSource.syncStatus` (never | syncing | synced | failed), set by
 * `syncMediaItems()` around every full sync. See services/media/sync-media.ts.
 */

export type SourceSyncFields = { enabled: boolean; baseUrl: string | null; syncStatus: string };

export type SourceReadiness = {
  connected: boolean;
  syncing: boolean;
  synced: boolean;
  failed: boolean;
  /** connected AND a full metadata sync has completed — the one bar for building channels/lineups. */
  ready: boolean;
};

/** Pure readiness from a source's connection + sync fields. */
export function sourceReadiness(s: SourceSyncFields): SourceReadiness {
  const connected = s.enabled && s.baseUrl != null;
  const syncing = s.syncStatus === "syncing";
  const synced = s.syncStatus === "synced";
  const failed = s.syncStatus === "failed";
  return { connected, syncing, synced, failed, ready: connected && synced };
}

/** A human reason a source isn't ready (for gate errors), or null if it IS ready. `action` completes
 *  the sentence, e.g. "create channels" → "…before you can create channels." */
export function notReadyReason(s: SourceSyncFields, action = "do this"): string | null {
  const r = sourceReadiness(s);
  if (r.ready) return null;
  if (!r.connected) return `This media source isn't connected to a media server. Connect it before you can ${action}.`;
  if (r.syncing) return `This source is still syncing its metadata — wait for the sync to finish before you can ${action}.`;
  return `Run a metadata sync on this source before you can ${action} — there's no synced media to build from yet.`;
}

/** Readiness of a specific source by id (null if it doesn't exist). Carries the raw fields so callers
 *  can build a `notReadyReason`. */
export async function getSourceReadiness(
  prisma: PrismaClient,
  sourceId: string,
): Promise<(SourceReadiness & { fields: SourceSyncFields }) | null> {
  const fields = await prisma.mediaSource.findUnique({
    where: { id: sourceId },
    select: { enabled: true, baseUrl: true, syncStatus: true },
  });
  if (!fields) return null;
  return { ...sourceReadiness(fields), fields };
}

/** The first fully-ready source (connected + synced), or null — for "any source" gates (AI lineup,
 *  AI chat) that don't target a specific source. */
export async function firstReadySource(
  prisma: PrismaClient,
): Promise<{ id: string; name: string } | null> {
  const source = await prisma.mediaSource.findFirst({
    where: { enabled: true, baseUrl: { not: null }, syncStatus: "synced" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  return source;
}
