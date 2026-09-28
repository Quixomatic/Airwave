import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { WEBHOOK_EVENT_TYPES } from "@airwave/api/services/webhooks";

import pkg from "../../../package.json";
import type { PublicVars } from "../context";

const CapabilitiesDTO = z
  .object({
    apiVersion: z.literal("v1"),
    serverVersion: z.string(),
    features: z
      .object({
        workflowEngine: z.boolean().describe("The AI lineup workflow engine is enabled on this server."),
      })
      .describe("Optional server features a consumer might branch on."),
    webhooks: z.object({
      supported: z.boolean(),
      eventTypes: z.array(z.string()).describe("Subscribable webhook event types (empty until webhooks ship)."),
    }),
    sse: z.object({
      supported: z.boolean().describe("Whether GET /events (Server-Sent Events) is available."),
    }),
  })
  .openapi("Capabilities", {
    example: {
      apiVersion: "v1",
      serverVersion: "0.14.65",
      features: { workflowEngine: true },
      webhooks: {
        supported: true,
        eventTypes: [
          "session.started",
          "session.ended",
          "playback.started",
          "playback.stopped",
          "playback.paused",
          "playback.resumed",
          "channel.tuned",
          "ping",
        ],
      },
      sse: { supported: false },
    },
  });

export const capabilitiesRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

capabilitiesRoutes.openapi(
  createRoute({
    method: "get",
    path: "/capabilities",
    tags: ["Server"],
    summary: "API capabilities",
    description:
      "What this public API supports on this server: API version, optional server features, and whether " +
      "webhooks and the SSE event stream are available. Lets a consumer degrade gracefully.",
    security: [{ ApiKeyHeader: [] }, { BearerAuth: [] }],
    responses: {
      200: { description: "Capabilities.", content: { "application/json": { schema: CapabilitiesDTO } } },
    },
  }),
  (c) =>
    c.json(
      {
        apiVersion: "v1" as const,
        serverVersion: pkg.version,
        features: { workflowEngine: process.env.WORKFLOW_ENABLED === "1" },
        // Webhooks are live (Phase 2); SSE lands in Phase 3.
        webhooks: { supported: true, eventTypes: [...WEBHOOK_EVENT_TYPES] },
        sse: { supported: false },
      },
      200,
    ),
);
