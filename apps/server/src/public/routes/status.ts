import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

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
  })
  .openapi("ServerStatus", {
    example: {
      product: "airwave",
      version: "0.14.64",
      instanceId: "a91d2ea1-5f7f-4c2e-9b0a-1e2d3c4b5a6f",
      name: "Blue Turtle - Airwave Server",
      time: "2026-09-27T18:20:00.000Z",
      timezone: "UTC",
    },
  });

export const statusRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

statusRoutes.openapi(
  createRoute({
    method: "get",
    path: "/status",
    tags: ["Server"],
    summary: "Server status",
    description: "Liveness plus this server's identity (product, version, install id, display name, time).",
    security: [{ ApiKeyHeader: [] }, { BearerAuth: [] }],
    responses: {
      200: { description: "Server status.", content: { "application/json": { schema: StatusDTO } } },
    },
  }),
  async (c) => {
    const [instanceId, name] = await Promise.all([getInstanceId(prisma), getServerName(prisma)]);
    return c.json(
      {
        product: "airwave" as const,
        version: pkg.version,
        instanceId,
        name,
        time: new Date().toISOString(),
        timezone: process.env.TZ || "UTC",
      },
      200,
    );
  },
);
