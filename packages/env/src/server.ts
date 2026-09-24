import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    // The TV app's origin (dev: http://localhost:3002; later the webOS app
    // origin). Optional — when set, it's allowed through CORS + better-auth
    // trustedOrigins so the TV app can call /api/auth, /api/tv/auth, /api/v1.
    TV_APP_ORIGIN: z.url().optional(),
    // Extra allowed admin origins beyond CORS_ORIGIN — a COMMA-SEPARATED list of exact origins
    // (scheme + host + port). Added to both the cookie-CORS allowlist and better-auth trustedOrigins.
    // Use it when the admin is reachable at more than one address, e.g. a public domain in CORS_ORIGIN
    // plus a LAN IP: EXTRA_CORS_ORIGINS=http://192.168.1.168:36021
    EXTRA_CORS_ORIGINS: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // First-admin seed (Overseerr-style). Optional — set both to bootstrap an
    // admin account on server startup.
    ADMIN_EMAIL: z.string().min(1).optional(),
    ADMIN_PASSWORD: z.string().min(1).optional(),

    // Social OAuth — a provider is enabled only when both id + secret are set.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    // Stable X-Plex-Client-Identifier for the Plex login handshake.
    PLEX_CLIENT_IDENTIFIER: z.string().optional(),

    // Airwave Cloud (airwave.software) base URL for Remote Access pairing. Optional override; the stored
    // RemoteAccess.cloudBaseUrl (default https://api.airwave.software) is used when unset.
    AIRWAVE_CLOUD_URL: z.string().optional(),
    // The relay's WebSocket control URL to dial. Optional override (handy for local testing, e.g.
    // ws://127.0.0.1:3020/__relay/connect); otherwise the URL the cloud returns at register is used.
    AIRWAVE_RELAY_URL: z.string().optional(),
    // Internal HTTP origins the connector proxies the admin web + tv-web static services to, so the cloud
    // tunnel can serve them alongside the API (e.g. in Docker: http://web:3001 / http://tvweb:3002). When
    // unset, the connector forwards those requests to the server itself (today's single-service behavior).
    AIRWAVE_WEB_ORIGIN: z.string().optional(),
    AIRWAVE_TVWEB_ORIGIN: z.string().optional(),
    // Feature flag for the whole "Cloud Service" (Airwave Cloud remote access). Hidden + inert by default
    // (the settings frame doesn't render, the connector never dials, the sync job no-ops). Set to "1" to
    // expose + activate it. Lets us ship the code dark until remote access is ready to announce.
    AIRWAVE_CLOUD_SERVICE_ENABLED: z.string().optional(),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
