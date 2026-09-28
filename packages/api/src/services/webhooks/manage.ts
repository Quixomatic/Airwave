import { randomUUID } from "node:crypto";

import prisma, { Prisma } from "@airwave/db";

import { decryptSecret, encryptSecret } from "../crypto";
import { wakeDispatcher } from "./dispatcher";
import { generateWebhookSecret } from "./signing";
import { refreshWebhookSubscriptions } from "./subscriptions";
import { WEBHOOK_EVENT_TYPES, type EventEnvelope } from "./types";

/** Public shape of a webhook — NEVER includes the signing secret. */
const publicSelect = {
  id: true,
  url: true,
  eventTypes: true,
  description: true,
  enabled: true,
  disabledAt: true,
  disabledReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type WebhookPublic = Prisma.WebhookGetPayload<{ select: typeof publicSelect }>;

/** Validate a delivery URL. http/https only, and block the cloud metadata IP as a basic SSRF guard. */
function assertValidUrl(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("Webhook URL must be a valid absolute URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Webhook URL must use http or https.");
  }
  if (u.hostname === "169.254.169.254") {
    throw new Error("Webhook URL points at a blocked address.");
  }
}

/** Reject unknown event types up front (empty list = subscribe to all). */
function assertValidEventTypes(types: string[]): void {
  const known = new Set<string>(WEBHOOK_EVENT_TYPES);
  const bad = types.filter((t) => !known.has(t));
  if (bad.length) throw new Error(`Unknown event type(s): ${bad.join(", ")}.`);
}

export async function listWebhooks(): Promise<WebhookPublic[]> {
  return prisma.webhook.findMany({ orderBy: { createdAt: "desc" }, select: publicSelect });
}

export async function getWebhook(id: string): Promise<WebhookPublic | null> {
  return prisma.webhook.findUnique({ where: { id }, select: publicSelect });
}

/** Create a webhook. Returns the public row PLUS the plaintext secret, shown to the caller exactly once. */
export async function createWebhook(input: {
  url: string;
  eventTypes: string[];
  description?: string | null;
}): Promise<{ webhook: WebhookPublic; secret: string }> {
  assertValidUrl(input.url);
  assertValidEventTypes(input.eventTypes);
  const secret = generateWebhookSecret();
  const webhook = await prisma.webhook.create({
    data: {
      url: input.url,
      eventTypes: input.eventTypes,
      description: input.description ?? null,
      secretEnc: encryptSecret(secret),
    },
    select: publicSelect,
  });
  await refreshWebhookSubscriptions();
  return { webhook, secret };
}

export async function updateWebhook(
  id: string,
  patch: { url?: string; eventTypes?: string[]; enabled?: boolean; description?: string | null },
): Promise<WebhookPublic | null> {
  if (patch.url !== undefined) assertValidUrl(patch.url);
  if (patch.eventTypes !== undefined) assertValidEventTypes(patch.eventTypes);
  const existing = await prisma.webhook.findUnique({ where: { id } });
  if (!existing) return null;
  // Re-enabling clears the auto-disable bookkeeping so it gets a fresh run of retries.
  const reenabling = patch.enabled === true && !existing.enabled;
  const webhook = await prisma.webhook.update({
    where: { id },
    data: {
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(patch.eventTypes !== undefined ? { eventTypes: patch.eventTypes } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(reenabling ? { consecutiveFailures: 0, disabledAt: null, disabledReason: null } : {}),
    },
    select: publicSelect,
  });
  await refreshWebhookSubscriptions();
  return webhook;
}

export async function deleteWebhook(id: string): Promise<boolean> {
  const existing = await prisma.webhook.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return false;
  await prisma.webhook.delete({ where: { id } }); // cascades to deliveries
  await refreshWebhookSubscriptions();
  return true;
}

/** Rotate the signing secret. Returns the new plaintext secret (shown once). */
export async function rotateWebhookSecret(id: string): Promise<{ secret: string } | null> {
  const existing = await prisma.webhook.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;
  const secret = generateWebhookSecret();
  await prisma.webhook.update({ where: { id }, data: { secretEnc: encryptSecret(secret) } });
  await refreshWebhookSubscriptions();
  return { secret };
}

/** Enqueue a synthetic `ping` to THIS endpoint (bypasses subscription matching) so the admin can verify wiring. */
export async function sendTestEvent(id: string): Promise<boolean> {
  const webhook = await prisma.webhook.findUnique({ where: { id }, select: { id: true } });
  if (!webhook) return false;
  const envelope: EventEnvelope = {
    id: randomUUID(),
    type: "ping",
    timestamp: new Date().toISOString(),
    data: { message: "This is a test event from Airwave." },
  };
  await prisma.webhookDelivery.create({
    data: {
      webhookId: id,
      eventId: envelope.id,
      eventType: "ping",
      payload: envelope as unknown as Prisma.InputJsonValue,
    },
  });
  wakeDispatcher();
  return true;
}

export async function listDeliveries(
  webhookId: string,
  opts: { limit?: number; cursor?: string } = {},
): Promise<{ deliveries: DeliveryPublic[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const rows = await prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: deliverySelect,
  });
  const nextCursor = rows.length > limit ? (rows[limit]?.id ?? null) : null;
  return { deliveries: rows.slice(0, limit), nextCursor };
}

/** Re-queue a single past delivery to send again now (fresh retry budget). */
export async function redeliver(deliveryId: string): Promise<boolean> {
  const existing = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, select: { id: true } });
  if (!existing) return false;
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status: "pending", attempt: 0, nextAttemptAt: new Date(), error: null, responseCode: null },
  });
  wakeDispatcher();
  return true;
}

const deliverySelect = {
  id: true,
  eventId: true,
  eventType: true,
  status: true,
  attempt: true,
  responseCode: true,
  error: true,
  durationMs: true,
  nextAttemptAt: true,
  deliveredAt: true,
  createdAt: true,
} as const;

export type DeliveryPublic = Prisma.WebhookDeliveryGetPayload<{ select: typeof deliverySelect }>;

/** Decrypt a webhook's secret (server-side use only — the dispatcher signs with it). */
export async function getWebhookSecret(id: string): Promise<string | null> {
  const w = await prisma.webhook.findUnique({ where: { id }, select: { secretEnc: true } });
  return w ? decryptSecret(w.secretEnc) : null;
}
