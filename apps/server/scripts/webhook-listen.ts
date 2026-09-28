/**
 * Live webhook listener — watch Airwave events stream in as YOU play content.
 *
 *   cd apps/server && bun --env-file=.env run scripts/webhook-listen.ts
 *   AIRWAVE_URL=http://localhost:3000 bun --env-file=.env run scripts/webhook-listen.ts
 *
 * How it works: it registers a TEMPORARY webhook on your RUNNING Airwave server (via the public API,
 * authenticating with a temp admin key it mints), pointed at a little HTTP receiver this script runs on
 * localhost. Your running server's dispatcher then delivers real events (from actual playback heartbeats) to
 * it, and they print here live with their Standard Webhooks signature verified.
 *
 * Requirements: your Airwave server must be running and reachable at AIRWAVE_URL (default http://localhost:3000),
 * on the SAME machine (the server POSTs to 127.0.0.1). Press Ctrl+C to stop — it cleans up the temp webhook + key.
 */
import crypto from "node:crypto";

import { auth } from "@airwave/auth";
import prisma from "@airwave/db";

const AIRWAVE_URL = (process.env.AIRWAVE_URL ?? process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const BASE = `${AIRWAVE_URL}/api/public/v1`;
const DESC = "webhook-listen (temp)";

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

async function main() {
  // 1. Mint a temporary admin key (we call our own public API with it, same as the server would accept).
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  if (!admin) throw new Error("No admin user found — run the app once so an admin exists.");
  const created = (await auth.api.createApiKey({
    body: { name: "webhook-listen (temp)", prefix: "airwave_", userId: admin.id, metadata: { probe: true } },
  })) as { id: string; key: string };
  const keyId = created.id;
  const KEY = created.key;

  const api = (path: string, init?: RequestInit) =>
    fetch(`${BASE}${path}`, { ...init, headers: { "x-api-key": KEY, "content-type": "application/json", ...(init?.headers ?? {}) } });

  // 2. Reachability check + tidy any stale temp listeners from a previous crashed run.
  try {
    const listRes = await api("/webhooks");
    if (!listRes.ok) throw new Error(`GET /webhooks → ${listRes.status}`);
    const { webhooks } = (await listRes.json()) as { webhooks: { id: string; description: string | null }[] };
    for (const w of webhooks.filter((x) => x.description === DESC)) await api(`/webhooks/${w.id}`, { method: "DELETE" });
  } catch (e) {
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    throw new Error(`Can't reach your Airwave server at ${AIRWAVE_URL}. Is it running? Set AIRWAVE_URL if it's on another port.\n  (${e instanceof Error ? e.message : e})`);
  }

  // 3. Start the local receiver.
  let count = 0;
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const raw = await req.text();
      const id = req.headers.get("webhook-id") ?? "";
      const ts = req.headers.get("webhook-timestamp") ?? "";
      const sig = req.headers.get("webhook-signature") ?? "";
      const expected = "v1," + crypto.createHmac("sha256", Buffer.from(secret.slice("whsec_".length), "base64")).update(`${id}.${ts}.${raw}`).digest("base64");
      const ok = sig === expected;
      let env: { type?: string; data?: Record<string, unknown> } = {};
      try { env = JSON.parse(raw); } catch { /* ignore */ }
      const d = (env.data ?? {}) as Record<string, unknown>;
      const ch = d.channel as { number?: number; name?: string } | undefined;
      const prog = d.program as { title?: string | null } | undefined;
      const bits = [
        d.user ? `${d.user}` : null,
        ch ? `ch ${ch.number} ${ch.name}` : null,
        prog?.title ? `"${prog.title}"` : null,
      ].filter(Boolean).join(c.dim(" · "));
      const time = new Date().toLocaleTimeString();
      console.log(
        `${c.dim(time)}  ${c.bold(c.cyan((env.type ?? "?").padEnd(18)))} ${bits}  ${ok ? c.green("✓ sig") : c.red("✗ SIG")}  ${c.dim(`#${++count}`)}`,
      );
      return new Response("ok");
    },
  });
  const receiverUrl = `http://127.0.0.1:${server.port}/hook`;

  // 4. Register the temp webhook (subscribed to every event).
  const res = await api("/webhooks", { method: "POST", body: JSON.stringify({ url: receiverUrl, eventTypes: [], description: DESC }) });
  if (!res.ok) {
    server.stop(true);
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    throw new Error(`Failed to register the webhook (POST /webhooks → ${res.status}). ${await res.text()}`);
  }
  const { id: webhookId, secret } = (await res.json()) as { id: string; secret: string };

  console.log(c.bold("\n  Airwave webhook listener\n"));
  console.log(`  server    ${AIRWAVE_URL}`);
  console.log(`  receiver  ${receiverUrl}`);
  console.log(`  admin     ${admin.email}`);
  console.log(c.dim(`\n  Listening for every event. Go play/pause/stop or change channels on any client — events appear below.`));
  console.log(c.dim(`  Press Ctrl+C to stop (removes the temp webhook + key).\n`));

  // 5. Clean up on exit.
  let cleaning = false;
  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    console.log(c.dim("\n  cleaning up…"));
    await api(`/webhooks/${webhookId}`, { method: "DELETE" }).catch(() => {});
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    server.stop(true);
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void cleanup());
  process.on("SIGTERM", () => void cleanup());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
