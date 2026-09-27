import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { isChannelAllowed } from "@airwave/api/services/access/access";
import { listActiveSessions } from "@airwave/api/services/playback/sessions";
import prisma from "@airwave/db";

import type { PublicVars } from "../context";
import { apiKeySecurity, errorResponses } from "../dtos";

const SessionDTO = z
  .object({
    id: z.string(),
    user: z.string().describe("The viewer's display name (or email)."),
    channel: z
      .object({ number: z.number().int(), name: z.string(), callsign: z.string().nullable() })
      .nullable(),
    state: z.string().describe('"program" | "bumper" | "off".'),
    title: z.string().nullable(),
    showTitle: z.string().nullable(),
    season: z.number().int().nullable(),
    episode: z.number().int().nullable(),
    year: z.number().int().nullable(),
    progress: z
      .object({ positionSeconds: z.number(), durationSeconds: z.number() })
      .nullable(),
    startedAt: z.string(),
    device: z.object({ model: z.string().nullable(), platform: z.string().nullable() }).nullable(),
  })
  .openapi("Session", {
    example: {
      id: "clx9sess01",
      user: "James",
      channel: { number: 101, name: "90s Sitcoms", callsign: "SITCOM" },
      state: "program",
      title: "The One With the Blackout",
      showTitle: "Friends",
      season: 1,
      episode: 7,
      year: 1994,
      progress: { positionSeconds: 540, durationSeconds: 1320 },
      startedAt: "2026-09-27T18:10:00.000Z",
      device: { model: "Apple TV 4K", platform: "tvOS" },
    },
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSession(s: any): z.infer<typeof SessionDTO> {
  return {
    id: s.id,
    user: s.user,
    channel: s.channel
      ? { number: s.channel.number, name: s.channel.name, callsign: s.channel.callsign ?? null }
      : null,
    state: s.state,
    title: s.title ?? null,
    showTitle: s.showTitle ?? null,
    season: s.season ?? null,
    episode: s.episode ?? null,
    year: s.year ?? null,
    progress: s.progress
      ? { positionSeconds: s.progress.positionSeconds, durationSeconds: s.progress.durationSeconds }
      : null,
    startedAt: (s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt)).toISOString(),
    device: s.device ? { model: s.device.model ?? null, platform: s.device.platform ?? null } : null,
  };
}

export const sessionRoutes = new OpenAPIHono<{ Variables: PublicVars }>();

// Scope to sessions on channels the key may access (admin keys see all).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function accessibleSessions(access: PublicVars["access"]): Promise<any[]> {
  const sessions = await listActiveSessions(prisma);
  return sessions.filter((s) => !s.channelId || isChannelAllowed(access, s.channelId));
}

sessionRoutes.openapi(
  createRoute({
    method: "get",
    path: "/sessions",
    tags: ["Now watching"],
    summary: "Active watch sessions",
    description: "Who's watching what right now (heartbeated within the last 30 seconds).",
    security: apiKeySecurity,
    responses: {
      200: {
        description: "Active sessions.",
        content: { "application/json": { schema: z.object({ sessions: z.array(SessionDTO) }) } },
      },
      401: errorResponses[401],
    },
  }),
  async (c) => {
    const sessions = await accessibleSessions(c.get("access"));
    return c.json({ sessions: sessions.map(toSession) }, 200);
  },
);

sessionRoutes.openapi(
  createRoute({
    method: "get",
    path: "/sessions/count",
    tags: ["Now watching"],
    summary: "Active viewer count",
    description: "The number of active watch sessions — the cheapest sensor for 'is anyone watching'.",
    security: apiKeySecurity,
    responses: {
      200: {
        description: "Count.",
        content: { "application/json": { schema: z.object({ count: z.number().int() }) } },
      },
      401: errorResponses[401],
    },
  }),
  async (c) => {
    const sessions = await accessibleSessions(c.get("access"));
    return c.json({ count: sessions.length }, 200);
  },
);

sessionRoutes.openapi(
  createRoute({
    method: "get",
    path: "/now-playing",
    tags: ["Now watching"],
    summary: "Now playing (compact)",
    description: "A friendly, compact view of what each active viewer is watching.",
    security: apiKeySecurity,
    responses: {
      200: {
        description: "Now playing.",
        content: {
          "application/json": {
            schema: z.object({
              nowPlaying: z.array(
                z.object({
                  user: z.string(),
                  channelNumber: z.number().int().nullable(),
                  channelName: z.string().nullable(),
                  title: z.string().nullable(),
                  showTitle: z.string().nullable(),
                  progress: z
                    .object({ positionSeconds: z.number(), durationSeconds: z.number() })
                    .nullable(),
                }),
              ),
            }),
          },
        },
      },
      401: errorResponses[401],
    },
  }),
  async (c) => {
    const sessions = (await accessibleSessions(c.get("access"))).filter((s) => s.state !== "off");
    return c.json(
      {
        nowPlaying: sessions.map((s) => ({
          user: s.user,
          channelNumber: s.channel?.number ?? null,
          channelName: s.channel?.name ?? null,
          title: s.title ?? null,
          showTitle: s.showTitle ?? null,
          progress: s.progress
            ? { positionSeconds: s.progress.positionSeconds, durationSeconds: s.progress.durationSeconds }
            : null,
        })),
      },
      200,
    );
  },
);
