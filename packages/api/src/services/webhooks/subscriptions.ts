import prisma from "@airwave/db";

/**
 * In-memory subscription cache — the "is anyone listening?" fast path for `emitEvent`. Holds every ENABLED
 * webhook (id/url/secret/eventTypes) so a broadcast is a memory filter, not a DB query, when the box is idle.
 * Rebuilt (REPLACED, never appended) at boot and on any webhook create/update/delete/enable, so it can't grow
 * unbounded. Single-instance, like the rest of the job runtime.
 */
type CachedWebhook = { id: string; url: string; secretEnc: string; eventTypes: string[] };

let cache: CachedWebhook[] = [];

/** Reload the cache from the DB (enabled webhooks only). Call at boot and after any webhook mutation. */
export async function refreshWebhookSubscriptions(): Promise<void> {
  cache = await prisma.webhook.findMany({
    where: { enabled: true },
    select: { id: true, url: true, secretEnc: true, eventTypes: true },
  });
}

/** Enabled webhooks subscribed to `type` (an empty `eventTypes` means "all events"). Pure in-memory, no DB. */
export function webhooksForEvent(type: string): CachedWebhook[] {
  return cache.filter((w) => w.eventTypes.length === 0 || w.eventTypes.includes(type));
}

/** Whether any enabled webhook would receive `type` — the cheapest possible listener check. */
export function hasWebhookSubscribers(type: string): boolean {
  return cache.some((w) => w.eventTypes.length === 0 || w.eventTypes.includes(type));
}
