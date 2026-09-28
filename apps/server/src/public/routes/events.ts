import { randomUUID } from "node:crypto";

import { OpenAPIHono } from "@hono/zod-openapi";
import { streamSSE } from "hono/streaming";

import { addSseClient, removeSseClient, sseAtCapacity } from "@airwave/api/services/webhooks";
import { auth } from "@airwave/auth";

import type { PublicVars } from "../context";

/**
 * Server-Sent Events stream — the live counterpart to webhooks, for always-connected clients (a Tauri app, a
 * wall dashboard). One long-lived `GET /api/public/v1/events` connection receives the same envelopes webhooks
 * deliver, `{ id, type, timestamp, data }`, as SSE `event:`/`data:` frames.
 *
 * Auth is custom (this route is exempt from the shared key middleware) so a browser `EventSource`, which can't
 * set headers, can pass the key as `?api_key=`; header auth (X-API-Key / Bearer) also works for fetch-based
 * clients. `?types=a,b` filters to specific event types.
 */
export const eventRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

eventRoutes.get("/events", async (c) => {
  const raw = c.req.header("x-api-key") ?? c.req.header("authorization") ?? c.req.query("api_key") ?? "";
  const key = raw.replace(/^Bearer\s+/i, "").trim();
  if (!key) {
    return c.json(
      { error: { code: "unauthorized", message: "API key required (X-API-Key header or ?api_key)." } },
      401,
    );
  }
  const res = await auth.api.verifyApiKey({ body: { key } });
  if (!res.valid) {
    return c.json({ error: { code: "unauthorized", message: "Invalid or revoked API key." } }, 401);
  }
  if (sseAtCapacity()) {
    return c.json({ error: { code: "unavailable", message: "Too many event streams are open. Try again later." } }, 503);
  }

  const typesParam = c.req.query("types");
  const types = typesParam
    ? new Set(typesParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  return streamSSE(c, async (stream) => {
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      removeSseClient(client);
    };

    // Serialize all writes for this client so the keepalive tick and pushed events never interleave frames.
    // A failed write means the client is gone (disconnect without an abort event) — clean up so the set can't
    // leak dead clients even if onAbort never fires.
    let chain: Promise<void> = Promise.resolve();
    const write = (ev: { event: string; data: string; id?: string }): Promise<void> => {
      chain = chain.then(() => stream.writeSSE(ev)).catch(() => cleanup());
      return chain;
    };

    const client = { id: randomUUID(), types, write };
    addSseClient(client);
    stream.onAbort(cleanup);

    await write({ event: "hello", data: JSON.stringify({ product: "airwave", filter: types ? [...types] : "all" }) });

    // Hold the connection open, sending a keepalive so idle proxies don't drop the stream. The keepalive
    // doubles as a liveness probe: once the client disconnects, the write fails and cleanup fires.
    while (!closed) {
      await stream.sleep(15_000);
      if (closed) break;
      await write({ event: "keepalive", data: JSON.stringify({ t: Date.now() }) });
    }
  });
});
