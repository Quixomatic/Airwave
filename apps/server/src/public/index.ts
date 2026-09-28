import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";

import pkg from "../../package.json";
import { apiKeyAuth, type PublicVars } from "./context";
import { artworkRoutes } from "./routes/artwork";
import { capabilitiesRoutes } from "./routes/capabilities";
import { channelRoutes } from "./routes/channels";
import { guideRoutes } from "./routes/guide";
import { packageRoutes } from "./routes/packages";
import { sessionRoutes } from "./routes/sessions";
import { statusRoutes } from "./routes/status";

/**
 * The public integration API — mounted at `/api/public/v1`. A SEPARATE, stable, API-key-authed surface for
 * outside consumers (Home Assistant, Tidbyt, Tauri, generic REST), distinct from the internal `/api/v1`
 * (TV clients) and `/trpc` (admin app). Handlers stay thin over `packages/api` services; the zod DTOs are the
 * single source of truth for both request validation and the generated OpenAPI 3.1 spec.
 *
 * See .plans/public-api-and-webhooks.md.
 */
export const publicApi = new OpenAPIHono<{ Variables: PublicVars }>({
  // Turn zod validation failures into our standard error envelope (422) instead of the default 400 text.
  defaultHook: (result, c) => {
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return c.json({ error: { code: "invalid_request", message } }, 422);
    }
  },
});

// Security schemes advertised in the spec — both map to the same `airwave_` key.
publicApi.openAPIRegistry.registerComponent("securitySchemes", "ApiKeyHeader", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
});
publicApi.openAPIRegistry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
});

// Key auth on everything except the public docs + spec, and the artwork proxy (tokenless by design — an
// <img> / entity_picture can't send a key; see routes/artwork.ts).
publicApi.use("*", (c, next) => {
  const p = c.req.path;
  if (p.endsWith("/openapi.json") || p.endsWith("/docs") || p.includes("/artwork/")) return next();
  return apiKeyAuth(c, next);
});

// Resource routers (grow per feature).
publicApi.route("/", statusRoutes);
publicApi.route("/", capabilitiesRoutes);
publicApi.route("/", channelRoutes);
publicApi.route("/", packageRoutes);
publicApi.route("/", guideRoutes);
publicApi.route("/", sessionRoutes);
publicApi.route("/", artworkRoutes);

// OpenAPI 3.1 document config — exported so a build script can emit the same spec for the getairwave.tv
// reference (the site can't import this app at build: no DB), and Scalar/the fumadocs playground all share it.
export const openApiConfig = {
  openapi: "3.1.0" as const,
  info: {
    title: "Airwave Public API",
    version: pkg.version,
    description:
      "Read your self-hosted Airwave server's live data (guide, channels, now-watching) and subscribe to " +
      "webhooks. Authenticate with an API key from Settings → API Keys, sent as either `X-API-Key` or " +
      "`Authorization: Bearer`.",
  },
  servers: [{ url: "/api/public/v1", description: "This server" }],
};

// The public spec, served for Scalar + as a fallback source for the docs site.
publicApi.doc31("/openapi.json", openApiConfig);

// Interactive reference UI (public) — a self-host convenience; the primary docs live on getairwave.tv.
publicApi.get("/docs", Scalar({ url: "/api/public/v1/openapi.json", pageTitle: "Airwave Public API" }));
