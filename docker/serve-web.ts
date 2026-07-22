/**
 * Minimal static file server for the built admin SPA (apps/web/dist), with
 * history-API fallback to index.html. Dependency-free — runs under Bun. Used by the
 * container's CG_ROLE=web role after `vite build` bakes in VITE_SERVER_URL.
 */
import { existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";

const DIST = process.env.WEB_DIST ?? "/app/apps/web/dist";
const PORT = Number(process.env.WEB_PORT ?? process.env.PORT ?? 3001);
const INDEX = join(DIST, "index.html");

if (!existsSync(INDEX)) {
  console.error(`[web] no build found at ${DIST} (expected index.html) — did the vite build run?`);
  process.exit(1);
}

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  idleTimeout: 30,
  fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    // Resolve within DIST and reject path traversal.
    const filePath = normalize(join(DIST, pathname));
    if (filePath !== DIST && !filePath.startsWith(DIST + sep)) {
      return new Response("forbidden", { status: 403 });
    }

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const file = Bun.file(filePath);
      // Long-cache Vite's fingerprinted assets; keep index.html/app shell revalidated.
      const headers =
        filePath.includes(`${sep}assets${sep}`)
          ? { "Cache-Control": "public, max-age=31536000, immutable" }
          : { "Cache-Control": "no-cache" };
      return new Response(file, { headers });
    }

    // SPA fallback — client-side routes (deep links, reloads) resolve to the app shell.
    return new Response(Bun.file(INDEX), { headers: { "Cache-Control": "no-cache" } });
  },
});

console.log(`[web] serving ${DIST} on :${PORT}`);
