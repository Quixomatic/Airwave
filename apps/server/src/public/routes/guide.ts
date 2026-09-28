import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { getGuideGrid } from "@airwave/api/services/guide";
import prisma from "@airwave/db";

import type { PublicVars } from "../context";
import { apiKeySecurity, errorResponses, PackageRefDTO, ProgramDTO } from "../dtos";
import { toProgram } from "../mappers";

const guideChannelBase = {
  id: z.string(),
  number: z.number().int(),
  name: z.string(),
  callsign: z.string().nullable(),
  icon: z.string().nullable(),
  tint: z.string().nullable(),
  package: PackageRefDTO,
};

const GuideChannelDTO = z
  .object({ ...guideChannelBase, programs: z.array(ProgramDTO) })
  .openapi("GuideChannel");

const NowChannelDTO = z
  .object({ ...guideChannelBase, now: ProgramDTO.nullable(), next: ProgramDTO.nullable() })
  .openapi("GuideNowChannel");

const mapPkg = (p: { id: string; key: string; name: string; icon: string | null; tint: string | null } | null) =>
  p ? { id: p.id, key: p.key ?? null, name: p.name, icon: p.icon ?? null, tint: p.tint ?? null } : null;

export const guideRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

guideRoutes.openapi(
  createRoute({
    method: "get",
    path: "/guide",
    tags: ["Guide"],
    summary: "Guide grid (now/next across all channels)",
    description:
      "Every accessible channel with its programs over a window. The marquee endpoint for a full EPG view.",
    security: apiKeySecurity,
    request: {
      query: z.object({
        forwardMinutes: z.coerce.number().int().min(30).max(1440).optional().openapi({ example: 180 }),
        backMinutes: z.coerce.number().int().min(0).max(1440).optional().openapi({ example: 60 }),
      }),
    },
    responses: {
      200: {
        description: "Guide grid.",
        content: {
          "application/json": {
            schema: z.object({
              serverTime: z.string(),
              windowMinutes: z.number().int(),
              backMinutes: z.number().int(),
              channels: z.array(GuideChannelDTO),
            }),
          },
        },
      },
      401: errorResponses[401],
    },
  }),
  async (c) => {
    const q = c.req.valid("query");
    const forwardMinutes = q.forwardMinutes ?? 180;
    const backMinutes = q.backMinutes ?? 60;
    const grid = await getGuideGrid(prisma, forwardMinutes, backMinutes, c.get("access"));
    return c.json(
      {
        serverTime: grid.serverTime.toISOString(),
        windowMinutes: grid.windowMinutes,
        backMinutes: grid.backMinutes,
        channels: grid.channels.map((ch) => ({
          id: ch.id,
          number: ch.number,
          name: ch.name,
          callsign: ch.callsign ?? null,
          icon: ch.icon ?? null,
          tint: ch.tint ?? null,
          package: mapPkg(ch.package),
          programs: ch.programs.map((p) => toProgram(p, ch.id)),
        })),
      },
      200,
    );
  },
);

guideRoutes.openapi(
  createRoute({
    method: "get",
    path: "/guide/now",
    tags: ["Guide"],
    summary: "What's on right now (one row per channel)",
    description: "A compact now/next per channel — ideal for a Tidbyt or a small dashboard.",
    security: apiKeySecurity,
    responses: {
      200: {
        description: "Now/next per channel.",
        content: {
          "application/json": {
            schema: z.object({ serverTime: z.string(), channels: z.array(NowChannelDTO) }),
          },
        },
      },
      401: errorResponses[401],
    },
  }),
  async (c) => {
    const grid = await getGuideGrid(prisma, 240, 0, c.get("access"));
    const now = grid.serverTime.getTime();
    return c.json(
      {
        serverTime: grid.serverTime.toISOString(),
        channels: grid.channels.map((ch) => {
          const current = ch.programs.find((p) => {
            const s = new Date(p.startsAt).getTime();
            return s <= now && now < s + p.durationSeconds * 1000;
          });
          const next = ch.programs.find((p) => new Date(p.startsAt).getTime() > now);
          return {
            id: ch.id,
            number: ch.number,
            name: ch.name,
            callsign: ch.callsign ?? null,
            icon: ch.icon ?? null,
            tint: ch.tint ?? null,
            package: mapPkg(ch.package),
            now: current ? toProgram(current, ch.id) : null,
            next: next ? toProgram(next, ch.id) : null,
          };
        }),
      },
      200,
    );
  },
);
