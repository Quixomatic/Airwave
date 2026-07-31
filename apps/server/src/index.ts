import { createContext } from "@ChannelGuide/api/context";
import { appRouter } from "@ChannelGuide/api/routers/index";
import { runAgentChat } from "@ChannelGuide/api/services/agent/chat";
import { createFromUpload } from "@ChannelGuide/api/services/bumper-music/library";
import { contentTypeFor } from "@ChannelGuide/api/services/bumper-music/store";
import { startJobs } from "@ChannelGuide/api/services/jobs/scheduler";
import { resolveChannelSource } from "@ChannelGuide/api/services/playback/broker";
import { buildAuthUrl, createPin } from "@ChannelGuide/api/services/plex/client";
import prisma from "@ChannelGuide/db";
import { auth } from "@ChannelGuide/auth";
import { PLEX_CLIENT_ID } from "@ChannelGuide/auth/lib/plex-login";
import { seedAdmin } from "@ChannelGuide/auth/lib/seed-admin";
import { env } from "@ChannelGuide/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

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

// Cookie/admin surface (tRPC + web auth) — allowlisted origins + credentials.
const allowedOrigins = [env.CORS_ORIGIN, ...(env.TV_APP_ORIGIN ? [env.TV_APP_ORIGIN] : [])];
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

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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
  const ext = c.req.path.split(".").pop()?.toLowerCase() ?? "";
  const mt = MEDIA_MIME[ext];
  if (mt && c.res) {
    c.res = new Response(c.res.body, c.res);
    c.res.headers.set("Content-Type", mt);
  }
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
app.get("/img/:channelId", async (c) => {
  const path = c.req.query("path");
  const channelId = c.req.param("channelId");
  if (!path || !/^\/(library|photo)\//.test(path)) return c.text("bad path", 400);
  try {
    const { source } = await resolveChannelSource(prisma, channelId);
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
  } catch {
    return c.text("error", 500);
  }
});

app.route("/api/v1", restApi);

// TV device-code login (Plex plex.tv/link flow). Unauthenticated — these
// establish the session the TV carries as a bearer token to /api/v1.
app.route("/api/tv/auth", tvAuthApi);

// Lightweight health check (used by the Docker healthcheck / uptime monitors).
app.get("/api/health", (c) => c.json({ ok: true }));

// Single-container deploy: serve the built admin SPA when SERVE_WEB_DIR points at it. Registered
// LAST so it never shadows the API routes above; the `*` GET fallback returns index.html so
// client-side routes (deep links, reloads) work. Unset in dev — the admin runs on its own Vite
// server there, same-origin only in production.
const WEB_DIR = process.env.SERVE_WEB_DIR;
if (WEB_DIR) {
  app.use("*", serveStatic({ root: WEB_DIR }));
  app.get("*", serveStatic({ path: "index.html", root: WEB_DIR }));
} else {
  app.get("/", (c) => c.text("ChannelGuide server — the admin web runs separately in dev."));
}

// Bootstrap the first admin from env (idempotent; no-op if ADMIN_* unset).
try {
  await seedAdmin();
} catch (err) {
  console.error("Admin seeding failed:", err);
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

// Bun's default idleTimeout is 10s, which kills long streaming responses — an AI chat turn (extended
// thinking + a 100k-token context + multiple tool calls) easily goes >10s before/between chunks, so the
// socket was being closed mid-stream and the chat "hung". Raise it to Bun's max (255s); each streamed
// byte resets the idle clock, so this only bounds a truly stalled connection.
export default {
  port: Number(process.env.PORT) || 3000,
  idleTimeout: 255,
  fetch: app.fetch,
};
