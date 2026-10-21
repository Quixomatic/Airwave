/**
 * Live SSE listener (TICKET path) — the same event stream as sse-listen.ts, but authenticated the way a
 * browser EventSource must: it can't send an auth header, so it mints a single-use connection ticket and
 * connects with `?ticket=`. Use `sse-listen.ts` to exercise the header / API-key path; use THIS one to
 * exercise the ticket path (the GHSA-fjx9-jwmr-2r58 follow-up).
 *
 *   cd apps/server && bun --env-file=.env run scripts/sse-listen-ticket.ts
 *   AIRWAVE_URL=http://localhost:3000 bun --env-file=.env run scripts/sse-listen-ticket.ts
 *
 * Requires your server RUNNING at AIRWAVE_URL — the ticket store is an in-memory map inside that server
 * process (not persisted; a restart just clears it). This probe mints a temporary admin key, exchanges it
 * at the header-authed POST /events/ticket for a ~60s single-use ticket, opens GET /events?ticket= with no
 * auth header, and prints each event the instant it arrives. Ctrl+C revokes the key and disconnects.
 */
import { auth } from "@airwave/auth";
import prisma from "@airwave/db";

const AIRWAVE_URL = (process.env.AIRWAVE_URL ?? process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  if (!admin) throw new Error("No admin user found — run the app once so an admin exists.");
  const created = (await auth.api.createApiKey({
    body: { name: "sse-listen-ticket (temp)", prefix: "airwave_", userId: admin.id, metadata: { probe: true } },
  })) as { id: string; key: string };
  const keyId = created.id;

  const ac = new AbortController();
  let count = 0;
  const cleanup = async () => {
    ac.abort();
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", () => void cleanup());
  process.on("SIGTERM", () => void cleanup());

  const base = `${AIRWAVE_URL}/api/public/v1/events`;

  // Step 1 — mint a single-use ticket, authenticated with the key in a HEADER (never a URL).
  const ticketRes = await fetch(`${base}/ticket`, { method: "POST", headers: { "x-api-key": created.key } }).catch(() => null);
  if (!ticketRes || !ticketRes.ok) {
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    const detail = ticketRes ? `${ticketRes.status} ${await ticketRes.text().catch(() => "")}` : "unreachable";
    throw new Error(`POST /events/ticket failed (${detail}). Is your Airwave server running at ${AIRWAVE_URL}?`);
  }
  const { ticket } = (await ticketRes.json()) as { ticket: string };

  // Step 2 — open the stream with the ticket in the URL and NO auth header (as a browser EventSource would).
  let res: Response;
  try {
    res = await fetch(`${base}?ticket=${encodeURIComponent(ticket)}`, {
      headers: { accept: "text/event-stream" },
      signal: ac.signal,
    });
  } catch (e) {
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    throw new Error(`Can't reach your Airwave server at ${AIRWAVE_URL}. Is it running? (${e instanceof Error ? e.message : e})`);
  }
  if (!res.ok || !res.body) {
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    throw new Error(`GET /events?ticket= → ${res.status}. ${await res.text().catch(() => "")}`);
  }

  console.log(c.bold("\n  Airwave SSE listener (ticket path)\n"));
  console.log(`  stream  ${base}`);
  console.log(`  admin   ${admin.email}`);
  console.log(c.yellow("  auth    minted a ticket (POST /events/ticket) → connected with ?ticket="));
  console.log(c.dim(`\n  Connected. Play / stop / change channels on any client — events appear below. Ctrl+C to stop.\n`));

  // Parse the SSE frame stream: events are separated by a blank line; we care about the `event:` + `data:` lines.
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let ev = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) ev = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (ev === "keepalive") continue; // noise
      const time = new Date().toLocaleTimeString();
      if (ev === "hello") {
        console.log(`${c.dim(time)}  ${c.dim("hello — stream open")}`);
        continue;
      }
      let d: Record<string, unknown> = {};
      try { d = (JSON.parse(data).data ?? {}) as Record<string, unknown>; } catch { /* ignore */ }
      const ch = d.channel as { number?: number; name?: string } | undefined;
      const prog = d.program as { title?: string | null } | undefined;
      const bits = [d.user ? `${d.user}` : null, ch ? `ch ${ch.number} ${ch.name}` : null, prog?.title ? `"${prog.title}"` : null]
        .filter(Boolean)
        .join(c.dim(" · "));
      console.log(`${c.dim(time)}  ${c.bold(c.cyan(ev.padEnd(18)))} ${bits}  ${c.dim(`#${++count}`)}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
