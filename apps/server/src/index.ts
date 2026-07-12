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

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

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
