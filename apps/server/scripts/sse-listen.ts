/**
 * Live SSE listener — watch Airwave's event stream (GET /api/public/v1/events) as YOU play content.
 *
 *   cd apps/server && bun --env-file=.env run scripts/sse-listen.ts
 *   AIRWAVE_URL=http://localhost:3000 bun --env-file=.env run scripts/sse-listen.ts
 *
 * SSE is a long-lived streaming connection — a request/response client like Bruno or Postman waits for the
 * response to "finish" (which never happens) and only shows data at its timeout, so it LOOKS slow. This probe
 * is a proper SSE client: it mints a temporary admin key, connects to your RUNNING server's event stream, and
 * prints each event the instant it arrives. Ctrl+C revokes the key and disconnects.
 *
 * Requirements: your server must be running at AIRWAVE_URL (default http://localhost:3000).
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
    body: { name: "sse-listen (temp)", prefix: "airwave_", userId: admin.id, metadata: { probe: true } },
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

  const url = `${AIRWAVE_URL}/api/public/v1/events`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "x-api-key": created.key, accept: "text/event-stream" }, signal: ac.signal });
  } catch (e) {
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    throw new Error(`Can't reach your Airwave server at ${AIRWAVE_URL}. Is it running? (${e instanceof Error ? e.message : e})`);
  }
  if (!res.ok || !res.body) {
    await prisma.apikey.delete({ where: { id: keyId } }).catch(() => {});
    throw new Error(`GET /events → ${res.status}. ${await res.text().catch(() => "")}`);
  }

  console.log(c.bold("\n  Airwave SSE listener\n"));
  console.log(`  stream  ${url}`);
  console.log(`  admin   ${admin.email}`);
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
