import { randomUUID } from "node:crypto";

import prisma, { Prisma } from "@airwave/db";

import { wakeDispatcher } from "./dispatcher";
import { webhooksForEvent } from "./subscriptions";
import type { EventEnvelope, WebhookEventType } from "./types";

/**
 * Fire-and-forget event emission — the ONE hook business logic calls. It is `void` and self-contained: never
 * await it, and a failure here can never affect the originating action (playback logging, scheduling, ...).
 * Call it AFTER the action commits.
 *
 * The first thing it does is an in-memory subscription check; if nobody's listening (the common case) it
 * returns immediately with zero DB writes and zero network. Otherwise it writes one outbox row per subscribed
 * endpoint and wakes the dispatcher.
 */
export function emitEvent(type: WebhookEventType, data: unknown): void {
  void emitEventAsync(type, data).catch((err) => {
    console.error(`[webhooks] emitEvent(${type}) failed:`, err);
  });
}

async function emitEventAsync(type: WebhookEventType, data: unknown): Promise<void> {
  const targets = webhooksForEvent(type);
  if (targets.length === 0) return; // nobody subscribed → do nothing

  const envelope: EventEnvelope = { id: randomUUID(), type, timestamp: new Date().toISOString(), data };
  await prisma.webhookDelivery.createMany({
    data: targets.map((w) => ({
      webhookId: w.id,
      eventId: envelope.id,
      eventType: type,
      payload: envelope as unknown as Prisma.InputJsonValue,
    })),
  });
  wakeDispatcher();
}
