import { createContext } from "@ChannelGuide/api/context";
import { appRouter } from "@ChannelGuide/api/routers/index";
import { startJobs } from "@ChannelGuide/api/services/jobs/scheduler";
import { buildAuthUrl, createPin } from "@ChannelGuide/api/services/plex/client";
import { auth } from "@ChannelGuide/auth";
import { PLEX_CLIENT_ID } from "@ChannelGuide/auth/lib/plex-login";
import { seedAdmin } from "@ChannelGuide/auth/lib/seed-admin";
import { env } from "@ChannelGuide/env/server";
import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { restApi } from "./rest";
import { tvAuthApi } from "./tv-auth";

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

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

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
app.route("/api/v1", restApi);

// TV device-code login (Plex plex.tv/link flow). Unauthenticated — these
// establish the session the TV carries as a bearer token to /api/v1.
app.route("/api/tv/auth", tvAuthApi);

app.get("/", (c) => {
  return c.text("OK");
});

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

export default app;
