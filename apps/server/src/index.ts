import { createContext } from "@airwave/api/context";
import { appRouter } from "@airwave/api/routers/index";
import { runAgentChat } from "@airwave/api/services/agent/chat";
import { createFromUpload } from "@airwave/api/services/bumper-music/library";
import { contentTypeFor } from "@airwave/api/services/bumper-music/store";
import { resumePresetJobRuns } from "@airwave/api/services/generator/generate";
import { syncConnector } from "@airwave/api/services/remote-access/connector";
import { startJobs } from "@airwave/api/services/jobs/scheduler";
import { getInstanceId, getServerName } from "@airwave/api/services/settings/index";
import { resolveChannelSource, resolveMediaSource } from "@airwave/api/services/playback/broker";
import { buildAuthUrl, createPin } from "@airwave/api/services/plex/client";
import { encryptExistingSourceTokens } from "@airwave/api/services/plex/token";
import prisma from "@airwave/db";
import { auth } from "@airwave/auth";
import { PLEX_CLIENT_ID } from "@airwave/auth/lib/plex-login";
import { seedAdmin } from "@airwave/auth/lib/seed-admin";
import pkg from "../package.json";
import { env } from "@airwave/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono, type Context } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { mcpToolsApi } from "./mcp-tools";
import { restApi } from "./rest";
import { tvAuthApi } from "./tv-auth";
import { startWorkflowEngine } from "./workflow-engine";

const app = new Hono();

app.use(logger());
const corsMethods = ["GET", "POST", "OPTIONS"];
const corsHeaders = ["Content-Type", "Authorization"];

// Bearer/TV surface — authenticated by token, never cookies. Safe to allow ANY
// origin with credentials OFF (so cross-origin cookies are never sent), which is
// exactly what lets an installed webOS app (unknown / file:// / null origin)
// reach the API. See [[project-tv-client-api]] on CORS.
const bearerCors = cors({
  origin: "*",
  allowMethods: corsMethods,
  allowHeaders: corsHeaders,
  credentials: false,
});
app.use("/api/v1/*", bearerCors);
app.use("/api/tv/auth/*", bearerCors);
// The health probe is how a TV app discovers/validates a server (LAN scan + manual entry), from a
// different origin — so it needs permissive CORS like the rest of the bearer surface.
app.use("/api/health", bearerCors);
// The public identity/discovery endpoint (product + version + stable install id) — same permissive CORS,
// hit cross-origin during scan/manual-entry before login.
app.use("/api/identity", bearerCors);

// Cookie/admin surface (tRPC + web auth) — allowlisted origins + credentials. CORS_ORIGIN is the
// primary admin origin; EXTRA_CORS_ORIGINS (comma-separated) allow-lists additional admin addresses
// (e.g. a LAN IP alongside a public domain) so the admin works from more than one origin.
const extraOrigins = (env.EXTRA_CORS_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
const allowedOrigins = [env.CORS_ORIGIN, ...(env.TV_APP_ORIGIN ? [env.TV_APP_ORIGIN] : []), ...extraOrigins];
const cookieCors = cors({
  origin: allowedOrigins,
  allowMethods: corsMethods,
  allowHeaders: corsHeaders,
  credentials: true,
});
app.use("/api/auth/*", cookieCors);
app.use("/trpc/*", cookieCors);
app.use("/api/ai/*", cookieCors);
app.use("/api/admin/*", cookieCors);

// The host baked into BETTER_AUTH_URL. When a request arrives with a DIFFERENT x-forwarded-host, it came
// through a proxy that fronts this server at another origin — for us, the Airwave Cloud relay tunnel.
const BAKED_AUTH_HOST = (() => {
  try {
    return new URL(env.BETTER_AUTH_URL).host;
  } catch {
    return "";
  }
})();

/** Swap `url`'s origin (protocol + host, dropping any old port) to the given proto/host, preserving path +
 * query + hash. Built by string so the source origin's port (e.g. localhost:3000) can't leak through — the
 * URL `host` setter keeps the existing port when the new value has none. `host` may itself include a port. */
function withOrigin(url: string, proto: string, host: string): string {
  try {
    const u = new URL(url);
    return `${proto}://${host}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}

/**
 * Rewrite the Plex sign-in authorize URL to the forwarded public host when this request reached us through
 * the Airwave Cloud relay (x-forwarded-host differs from the baked BETTER_AUTH_URL host). Rewrites both the
 * authorize URL's own origin (so the browser can reach /api/plex/authorize over the tunnel) and its nested
 * redirect_uri (so Plex's forwardUrl returns to the tunnel host where the state cookie lives). Scoped to the
 * Plex authorize URL and a no-op for consistent-origin setups; all other auth responses pass through as-is.
 */
async function rewriteTunnelAuthorizeUrl(c: Context, res: Response): Promise<Response> {
  // x-forwarded-* can arrive as a comma-joined list (a proxy chain, or the relay + connector each appending);
  // the first value is the original client-facing host/proto.
  const host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host || host === BAKED_AUTH_HOST) return res;
  if (!(res.headers.get("content-type") ?? "").includes("application/json")) return res;
  const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  try {
    const data = (await res.clone().json()) as { url?: string; redirect?: boolean };
    if (typeof data.url !== "string" || !data.url.includes("/api/plex/authorize")) return res;
    const u = new URL(withOrigin(data.url, proto, host));
    const ru = u.searchParams.get("redirect_uri");
    if (ru) u.searchParams.set("redirect_uri", withOrigin(ru, proto, host));
    const body = JSON.stringify({ ...data, url: u.toString() });
    // Rebuild the response, preserving every header (Set-Cookie in particular — the OAuth state cookie) and
    // only dropping the now-stale content-length. getSetCookie() keeps multiple cookies from collapsing.
    const headers = new Headers(res.headers);
    const cookies = res.headers.getSetCookie?.() ?? [];
    if (cookies.length) {
      headers.delete("set-cookie");
      for (const ck of cookies) headers.append("set-cookie", ck);
    }
    headers.delete("content-length");
    return new Response(body, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
}

app.on(["POST", "GET"], "/api/auth/*", async (c) => {
  const res = await auth.handler(c.req.raw);
  // Airwave Cloud relay only (over the tunnel): the Plex web sign-in returns an authorize URL at this server's
  // /api/plex/authorize on the baked BETTER_AUTH_URL (e.g. http://localhost:3000). Over the tunnel the
  // browser is on a different origin (arctic.airwave.software) and (a) can't reach localhost and (b) set its
  // OAuth state cookie on the tunnel host — so Plex's forwardUrl (built from that URL's redirect_uri) sends
  // the callback to localhost, where the cookie is absent → state_mismatch. Rewrite both the authorize
  // URL's origin and its redirect_uri to the forwarded public host. No-op for consistent-origin setups
  // (reverse proxy / localhost), where x-forwarded-host equals the baked host, so nothing else is affected.
  if (c.req.path === "/api/auth/sign-in/oauth2") return rewriteTunnelAuthorizeUrl(c, res);
  return res;
});

// AI assistant chat — cookie-authed admin surface. Streams a UI-message response (Vercel AI SDK)
// from the active connection; DefaultChatTransport posts { id, messages }, id = the conversation id.
app.post("/api/ai/chat", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const user = session?.user as { id: string; role?: string | null } | undefined;
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const body = (await c.req.json().catch(() => null)) as { id?: string; messages?: unknown } | null;
  if (!body?.id || !Array.isArray(body.messages)) return c.json({ error: "id and messages required" }, 400);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return runAgentChat(prisma, user.id, { conversationId: body.id, messages: body.messages as any });
});

// Bumper-music upload (§7.14) — admin-only multipart. tRPC is JSON-only, so file uploads land here; the
// library management (list/toggle/rename/delete/scan) is tRPC (`bumperMusic.*`). Cookie-authed admin surface.
app.post("/api/admin/bumper-music", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  const user = session?.user as { id: string; role?: string | null } | undefined;
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
  if (file.size > 30 * 1024 * 1024) return c.json({ error: "File too large (max 30 MB)" }, 413);
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const row = await createFromUpload(prisma, file.name, bytes);
    return c.json({ ok: true, track: { id: row.id, title: row.title, filename: row.filename } });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Upload failed" }, 400);
  }
});

// Plex login authorize-proxy. better-auth's genericOAuth "plex" provider points
// its authorizationUrl here (with better-auth's redirect_uri + state). We create a
// pin, then bounce to Plex, setting forwardUrl back to better-auth's callback with
// the pin id smuggled in as `code` so getToken can retrieve the token.
app.get("/api/plex/authorize", async (c) => {
  const redirectUri = c.req.query("redirect_uri");
  const state = c.req.query("state");
  if (!redirectUri || !state) {
    return c.text("Missing redirect_uri or state", 400);
  }
  const { id: pinId, code } = await createPin(PLEX_CLIENT_ID);
  const forwardUrl = `${redirectUri}?code=${pinId}&state=${encodeURIComponent(state)}`;
  return c.redirect(buildAuthUrl(PLEX_CLIENT_ID, code, forwardUrl));
});

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
  }),
);

// REST guide/playback API for the TV apps (webOS first). Parallel to the tRPC
// admin surface; both call the same services. Auth = viewer-level via bearer
// token or cookie (see ./rest.ts). NOTE (H2/H5): the global CORS above allows
// only the admin web origin — when the webOS/TV origin is known, add it to
// CORS_ORIGIN + auth trustedOrigins (bearer/native fetch isn't subject to CORS).
// Capability-probe test media — PUBLIC static files (the TV plays them via
// <video src>, which can't send a bearer token). Generate with
// scripts/gen-capability-media.ts into CAP_MEDIA_DIR (default ./capability-media).
const CAP_MEDIA_DIR = process.env.CAP_MEDIA_DIR ?? "./capability-media";
const MEDIA_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
  ts: "video/mp2t",
  webm: "video/webm",
  avi: "video/x-msvideo",
  flv: "video/x-flv",
};
// Override serveStatic's octet-stream with the real video MIME (some TV players
// reject octet-stream for the native <video> element).
app.use("/caps/media/*", async (c, next) => {
  await next();
  if (!c.res) return;
  const ext = c.req.path.split(".").pop()?.toLowerCase() ?? "";
  const mt = MEDIA_MIME[ext];
  c.res = new Response(c.res.body, c.res);
  if (mt) c.res.headers.set("Content-Type", mt);
  // These probe fixtures are large (~6-8MB each, ~50 of them) but static and identical for every install,
  // keyed by test id in the filename. Cache them hard on the device so each clip is fetched at most once —
  // a big deal over the Airwave Cloud relay, where every re-fetch is Railway egress. `immutable` means a
  // returning viewer re-probes with zero network. (If a fixture's bytes ever change, give it a new filename
  // / bump the test id so the URL changes — an in-place overwrite under the same name would serve stale.)
  c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
});
app.use(
  "/caps/media/*",
  serveStatic({
    root: CAP_MEDIA_DIR,
    rewriteRequestPath: (p) => p.replace(/^\/caps\/media/, ""),
  }),
);

// Bumper-music audio (§7.14) — PUBLIC static files, range-served (the client streams via <audio src>, which
// can't send a bearer, and wants range for seek/cache). Root = BUMPER_MUSIC_DIR (a mounted volume on
// self-host; default ./bumper-music). The enabled-track LIST is behind viewer auth at /api/v1/bumper-music.
const BUMPER_MUSIC_DIR = process.env.BUMPER_MUSIC_DIR ?? "./bumper-music";
app.use("/bumper-music/*", async (c, next) => {
  await next();
  const mt = contentTypeFor(c.req.path);
  if (mt && c.res) {
    c.res = new Response(c.res.body, c.res);
    c.res.headers.set("Content-Type", mt);
    // Cache the bytes on the device — each track's URL is stable per file, so a re-played track serves from
    // the browser's disk cache with no network. serveStatic still sends Last-Modified/ETag, so a *changed*
    // file revalidates (304) rather than serving stale.
    c.res.headers.set("Cache-Control", "public, max-age=604800");
  }
});
app.use(
  "/bumper-music/*",
  serveStatic({
    root: BUMPER_MUSIC_DIR,
    rewriteRequestPath: (p) => decodeURIComponent(p.replace(/^\/bumper-music/, "")),
  }),
);

// Plex artwork proxy — PUBLIC (a CSS/<img> background can't send a bearer token), so
// the TV can use program cover art (blurred bumper backgrounds, guide thumbnails). Only
// proxies Plex image paths (/library, /photo) through the channel's own media source,
// injecting the admin token. `w`/`h` optionally resize via Plex's photo transcoder.
// Stream one Plex art path through a resolved source, injecting the admin token. Shared by the channel-keyed
// and source-keyed proxies below. `w`/`h` optionally resize via Plex's photo transcoder.
async function streamPlexArt(
  c: Context,
  // The resolvers hand back the full MediaSource; both guarantee a non-null baseUrl before returning (they throw
  // otherwise), so accept the broader `string | null` here rather than force a narrow at each call site.
  source: { baseUrl: string | null; token: string },
  path: string,
): Promise<Response> {
  const token = encodeURIComponent(source.token);
  const w = c.req.query("w");
  const h = c.req.query("h");
  const upstream =
    w || h
      ? `${source.baseUrl}/photo/:/transcode?url=${encodeURIComponent(path)}&width=${w ?? h}&height=${h ?? w}&minSize=1&X-Plex-Token=${token}`
      : `${source.baseUrl}${path}${path.includes("?") ? "&" : "?"}X-Plex-Token=${token}`;
  const res = await fetch(upstream);
  if (!res.ok) return c.text("not found", 404);
  const headers = new Headers();
  headers.set("Content-Type", res.headers.get("Content-Type") ?? "image/jpeg");
  headers.set("Cache-Control", "public, max-age=3600");
  return new Response(res.body, { status: 200, headers });
}

// Source-keyed variant — registered FIRST (more specific: 3 segments) so it's never shadowed by the
// channel route. Lets the admin's channel CREATE page preview artwork before a channel exists (no channelId
// to key on yet); it resolves the token straight from the media source. See channels.previewFilter.
app.get("/img/source/:sourceId", async (c) => {
  const path = c.req.query("path");
  if (!path || !/^\/(library|photo)\//.test(path)) return c.text("bad path", 400);
  try {
    const { source } = await resolveMediaSource(prisma, c.req.param("sourceId"));
    return await streamPlexArt(c, source, path);
  } catch {
    return c.text("error", 500);
  }
});

app.get("/img/:channelId", async (c) => {
  const path = c.req.query("path");
  if (!path || !/^\/(library|photo)\//.test(path)) return c.text("bad path", 400);
  try {
    const { source } = await resolveChannelSource(prisma, c.req.param("channelId"));
    return await streamPlexArt(c, source, path);
  } catch {
    return c.text("error", 500);
  }
});

// Admin-key MCP tool dispatch — mounted BEFORE /api/v1 so its own x-api-key guard handles these paths
// instead of the viewer session middleware in restApi.
app.route("/api/v1/tools", mcpToolsApi);

app.route("/api/v1", restApi);

// TV device-code login (Plex plex.tv/link flow). Unauthenticated — these
// establish the session the TV carries as a bearer token to /api/v1.
app.route("/api/tv/auth", tvAuthApi);

// Lightweight health check (used by the Docker healthcheck / uptime monitors).
app.get("/api/health", (c) => c.json({ ok: true }));

// Public identity / discovery handshake. Lets a TV client confirm a server is genuinely Airwave (vs. any host
// that happens to return {ok:true}) and recognize a specific install. `instanceId` is served from an in-memory
// cache (warmed at boot); a cold cache falls back to a DB read and self-heals a missing id. No auth, no secrets.
app.get("/api/identity", async (c) =>
  c.json({
    product: "airwave",
    version: pkg.version,
    instanceId: await getInstanceId(prisma),
    name: await getServerName(prisma),
  }),
);

// Single-container deploy: serve the built admin SPA when SERVE_WEB_DIR points at it. Registered
// LAST so it never shadows the API routes above; the `*` GET fallback returns index.html so
// client-side routes (deep links, reloads) work. Unset in dev — the admin runs on its own Vite
// server there, same-origin only in production.
const WEB_DIR = process.env.SERVE_WEB_DIR;
if (WEB_DIR) {
  app.use("*", serveStatic({ root: WEB_DIR }));
  app.get("*", serveStatic({ path: "index.html", root: WEB_DIR }));
} else {
  app.get("/", (c) => c.text("Airwave server — the admin web runs separately in dev."));
}

// Bootstrap the first admin from env (idempotent; no-op if ADMIN_* unset).
try {
  await seedAdmin();
} catch (err) {
  console.error("Admin seeding failed:", err);
}

// Ensure this install's stable fingerprint AND friendly display name exist (both generated once, like the
// admin seed) and warm their in-memory caches, so the public /api/identity handshake serves them without a
// DB lookup. Idempotent + best-effort. The instanceId is immutable; the server name is editable in settings.
try {
  // Sequential (not Promise.all): both seed the AppSettings singleton, so on a brand-new DB running them
  // concurrently could race two create-upserts into a unique-key conflict. getInstanceId creates the row.
  await getInstanceId(prisma);
  await getServerName(prisma);
} catch (err) {
  console.error("Instance identity init failed:", err);
}

// Encrypt any Plex owner token still stored as plaintext (one-time, idempotent — no-op once
// done). Runs before jobs so nothing reads a token mid-migration; decryption is tolerant of
// plaintext, so a hiccup here is non-fatal. See packages/api/src/services/plex/token.ts.
try {
  await encryptExistingSourceTokens(prisma);
} catch (err) {
  console.error("Plex token encryption backfill failed:", err);
}

// Register background jobs (metadata sync, library scan, schedule refresh).
try {
  await startJobs();
} catch (err) {
  console.error("Job scheduler startup failed:", err);
}

// Durable workflow engine for the AI lineup build (§7.3a). Independent of the job
// scheduler above — both run in-process against the same Postgres, in different schemas.
// Opt-in via WORKFLOW_ENABLED=1; a failure here must never stop the server booting.
try {
  await startWorkflowEngine();
} catch (err) {
  console.error("Workflow engine startup failed:", err);
}

// Resume any JOB-mode preset build interrupted by a crash/restart (recomputes the diff from current state).
// Independent of WORKFLOW_ENABLED — job runs happen when the engine is off. Best-effort, non-blocking.
try {
  await resumePresetJobRuns(prisma);
} catch (err) {
  console.error("Preset job resume failed:", err);
}

// Bring the Airwave Cloud tunnel up if this server is already paired + Cloud Service is on. Best-effort; the
// connector reconnects on its own, and the remote-access-sync job re-reconciles every couple of minutes.
try {
  await syncConnector(prisma);
} catch (err) {
  console.error("Cloud Service connector startup failed:", err);
}

// Bun's default idleTimeout is 10s, which kills long streaming responses — an AI chat turn (extended
// thinking + a 100k-token context + multiple tool calls) easily goes >10s before/between chunks, so the
// socket was being closed mid-stream and the chat "hung". Raise it to Bun's max (255s); each streamed
// byte resets the idle clock, so this only bounds a truly stalled connection.
export default {
  port: Number(process.env.PORT) || 3000,
  idleTimeout: 255,
  fetch: app.fetch,
};
