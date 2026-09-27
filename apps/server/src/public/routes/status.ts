import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { listGuideChannels } from "@airwave/api/services/guide";
import { listActivePackages } from "@airwave/api/services/packages";
import { listActiveSessions } from "@airwave/api/services/playback/sessions";
import { getInstanceId, getServerName } from "@airwave/api/services/settings/index";
import prisma from "@airwave/db";

import pkg from "../../../package.json";
import type { PublicVars } from "../context";

const StatusDTO = z
  .object({
    product: z.literal("airwave"),
    version: z.string(),
    instanceId: z.string(),
    name: z.string().describe("The server's friendly display name (editable in Settings → General)."),
    time: z.string().describe("Current server time, ISO-8601 UTC."),
    timezone: z.string(),
    uptimeSeconds: z.number().int().describe("Seconds since this server process started."),
    counts: z.object({
      channels: z.number().int(),
      packages: z.number().int(),
      activeSessions: z.number().int().describe("Viewers currently watching."),
    }),
  })
  .openapi("ServerStatus", {
    example: {
      product: "airwave",
      version: "0.14.65",
      instanceId: "a91d2ea1-5f7f-4c2e-9b0a-1e2d3c4b5a6f",
      name: "Blue Turtle - Airwave Server",
      time: "2026-09-27T18:20:00.000Z",
      timezone: "UTC",
      uptimeSeconds: 43210,
      counts: { channels: 42, packages: 8, activeSessions: 2 },
    },
  });

export const statusRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

statusRoutes.openapi(
  createRoute({
    method: "get",
    path: "/status",
    tags: ["Server"],
    summary: "Server status",
    description:
      "This server's identity (product, version, install id, display name), current time, uptime, and live " +
      "counts (channels, packages, active viewers). The one-stop endpoint for a Home Assistant sensor.",
    security: [{ ApiKeyHeader: [] }, { BearerAuth: [] }],
    responses: {
      200: { description: "Server status.", content: { "application/json": { schema: StatusDTO } } },
    },
  }),
  async (c) => {
    const [instanceId, name, channels, packages, sessions] = await Promise.all([
      getInstanceId(prisma),
      getServerName(prisma),
      listGuideChannels(prisma),
      listActivePackages(prisma),
      listActiveSessions(prisma),
    ]);
    return c.json(
      {
        product: "airwave" as const,
        version: pkg.version,
        instanceId,
        name,
        time: new Date().toISOString(),
        timezone: process.env.TZ || "UTC",
        uptimeSeconds: Math.round(process.uptime()),
        counts: { channels: channels.length, packages: packages.length, activeSessions: sessions.length },
      },
      200,
    );
  },
);
