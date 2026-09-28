import prisma from "@airwave/db";

import { decryptSecret } from "../crypto";
import { signWebhook } from "./signing";
import { refreshWebhookSubscriptions } from "./subscriptions";

// Tunables. Deliberately conservative so a chatty box never gets bogged down.
const SAFETY_INTERVAL_MS = 20_000; // the periodic net for retries/backoff + crash recovery
const BATCH_SIZE = 50; // rows claimed per pass — bounds memory regardless of backlog size
const CONCURRENCY = 5; // in-flight POSTs at once — a slow endpoint ties up one slot, not the box
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
const AUTO_DISABLE_AFTER = 15; // consecutive failed deliveries → auto-disable the endpoint
/** Backoff between attempts (ms): 30s, 2m, 10m, 30m, then 1h. */
const BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 3_600_000];

let timer: ReturnType<typeof setInterval> | null = null;
let running = false; // guard: only ever one drain in flight (ticks no-op instead of stacking)

/** Start the in-process dispatcher. Called once at boot (see apps/server/src/index.ts). Idempotent. */
export function startWebhookDispatcher(): void {
  if (timer) return;
  timer = setInterval(() => void tick(), SAFETY_INTERVAL_MS);
  void tick(); // drain anything left pending across a restart
  console.log("[webhooks] dispatcher started");
}

/** Stop the dispatcher (clears the sole timer). For tests / graceful shutdown. */
export function stopWebhookDispatcher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Low-latency poke from emitEvent so a new delivery goes out without waiting for the safety tick. */
export function wakeDispatcher(): void {
  void tick();
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const due = await prisma.webhookDelivery.findMany({
        where: { status: "pending", nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: "asc" },
        take: BATCH_SIZE,
      });
      if (due.length === 0) break;
      await mapWithConcurrency(due, CONCURRENCY, deliver);
      if (due.length < BATCH_SIZE) break; // drained
    }
  } catch (err) {
    console.error("[webhooks] dispatcher tick failed:", err);
  } finally {
    running = false;
  }
}

type DueRow = { id: string; webhookId: string; eventId: string; payload: unknown; attempt: number; nextAttemptAt: Date };

async function deliver(row: DueRow): Promise<void> {
  const webhook = await prisma.webhook.findUnique({ where: { id: row.webhookId } });
  if (!webhook || !webhook.enabled) {
    await prisma.webhookDelivery
      .update({ where: { id: row.id }, data: { status: "failed", error: "endpoint disabled or removed" } })
      .catch(() => {});
    return;
  }

  const body = JSON.stringify(row.payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signWebhook(decryptSecret(webhook.secretEnc), row.eventId, timestamp, body);

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  let responseCode: number | null = null;
  let ok = false;
  let errMsg: string | null = null;
  try {
    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "webhook-id": row.eventId,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": signature,
        "user-agent": "Airwave-Webhooks/1.0",
      },
      body,
      signal: controller.signal,
    });
    responseCode = res.status;
    ok = res.ok;
    if (!ok) errMsg = `HTTP ${res.status}`;
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(to);
  }
  const durationMs = Date.now() - started;

  if (ok) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: row.id },
        data: { status: "delivered", attempt: row.attempt + 1, responseCode, durationMs, deliveredAt: new Date(), error: null },
      }),
      prisma.webhook.update({ where: { id: webhook.id }, data: { consecutiveFailures: 0 } }),
    ]);
    return;
  }

  const attempt = row.attempt + 1;
  const maxed = attempt >= MAX_ATTEMPTS;
  await prisma.webhookDelivery.update({
    where: { id: row.id },
    data: {
      status: maxed ? "failed" : "pending",
      attempt,
      responseCode,
      error: errMsg,
      durationMs,
      nextAttemptAt: maxed
        ? row.nextAttemptAt
        : new Date(Date.now() + (BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)] ?? 3_600_000)),
    },
  });

  // Only count a fully-exhausted delivery against the endpoint; auto-disable after too many in a row.
  if (maxed) {
    const updated = await prisma.webhook.update({
      where: { id: webhook.id },
      data: { consecutiveFailures: { increment: 1 } },
    });
    if (updated.enabled && updated.consecutiveFailures >= AUTO_DISABLE_AFTER) {
      await prisma.webhook.update({
        where: { id: webhook.id },
        data: {
          enabled: false,
          disabledAt: new Date(),
          disabledReason: `Auto-disabled after ${updated.consecutiveFailures} consecutive failed deliveries`,
        },
      });
      await refreshWebhookSubscriptions(); // stop enqueuing to it
    }
  }
}

/** Bounded-concurrency map — at most `limit` `fn`s in flight; no unbounded promise fan-out. */
async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) break;
      await fn(item);
    }
  });
  await Promise.all(workers);
}
