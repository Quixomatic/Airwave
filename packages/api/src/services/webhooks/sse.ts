import type { EventEnvelope } from "./types";

/**
 * In-memory Server-Sent Events hub — the live-stream consumer of the same events webhooks deliver. A client
 * (a Tauri app, a live dashboard) holds one long GET /api/public/v1/events connection; each connected client
 * registers here with an optional type filter, and emitEvent pushes matching envelopes to all of them. Purely
 * in-memory + single-instance, like the rest of the event runtime; nothing is persisted (a disconnected client
 * just misses events — webhooks are the durable channel).
 */
export type SseClient = {
  id: string;
  /** null = all event types; otherwise only these. */
  types: Set<string> | null;
  /** Serialized write into this client's stream (see the route). Best-effort; errors are swallowed. */
  write: (ev: { event: string; data: string; id?: string }) => Promise<void>;
};

const clients = new Set<SseClient>();

/** Cap concurrent streams so a client that reconnects without closing can't grow the set unbounded. */
const MAX_CLIENTS = Number(process.env.AIRWAVE_SSE_MAX_CLIENTS) || 100;

export function sseAtCapacity(): boolean {
  return clients.size >= MAX_CLIENTS;
}

export function addSseClient(c: SseClient): void {
  clients.add(c);
}

export function removeSseClient(c: SseClient): void {
  clients.delete(c);
}

export function sseClientCount(): number {
  return clients.size;
}

/** Whether any connected client would receive `type` (or any client at all when `type` is omitted). */
export function hasSseClients(type?: string): boolean {
  if (clients.size === 0) return false;
  if (!type) return true;
  for (const c of clients) if (!c.types || c.types.has(type)) return true;
  return false;
}

/** Push an envelope to every connected client whose filter matches. Best-effort + parallel; a slow or dead
 *  client can't block the others or the caller. */
export async function publishToSse(envelope: EventEnvelope): Promise<void> {
  if (clients.size === 0) return;
  const payload = { event: envelope.type, id: envelope.id, data: JSON.stringify(envelope) };
  await Promise.allSettled(
    [...clients]
      .filter((c) => !c.types || c.types.has(envelope.type))
      .map((c) => c.write(payload).catch(() => {})),
  );
}
