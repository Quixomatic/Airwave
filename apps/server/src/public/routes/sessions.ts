import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";

import { isChannelAllowed } from "@airwave/api/services/access/access";
import { listActiveSessions } from "@airwave/api/services/playback/sessions";
import prisma from "@airwave/db";

import type { PublicVars } from "../context";
import { apiKeySecurity, buildArtworkUrl, errorResponses } from "../dtos";

const SessionDTO = z
  .object({
    id: z.string(),
    user: z.string().describe("The viewer's display name (or email)."),
    deviceId: z.string().describe("The device this session is on (one session per user + device)."),
    channel: z
      .object({ number: z.number().int(), name: z.string(), callsign: z.string().nullable() })
      .nullable(),
    state: z.string().describe('The schedule slot: "program" | "bumper" | "off".'),
    playbackState: z
      .string()
      .nullable()
      .describe('The player state, when the client reports it: "playing" | "paused" | "buffering" | "idle".'),
    title: z.string().nullable(),
    showTitle: z.string().nullable(),
    season: z.number().int().nullable(),
    episode: z.number().int().nullable(),
    year: z.number().int().nullable(),
    artworkUrl: z
      .string()
      .nullable()
      .describe(
        "Ready-to-use, tokenless poster URL for what's playing. Host-relative; prepend your server's base " +
          "URL and use it directly in an <img> / entity_picture.",
      ),
    progress: z
      .object({ positionSeconds: z.number(), durationSeconds: z.number() })
      .nullable(),
    startedAt: z.string(),
    device: z
      .object({
        id: z.string().nullable(),
        platform: z.string().nullable().describe('"webos" | "tizen" | "roku" | "ios" | "android" | "windows" | "browser".'),
        model: z.string().nullable(),
        osVersion: z.string().nullable(),
        hdr: z.boolean().nullable().describe("Whether the device's display reports HDR."),
      })
      .nullable()
      .describe("The device this session is on, when it's registered. Fields resolve best-effort (null when unknown)."),
  })
  .openapi("Session", {
    example: {
      id: "clx9sess01",
      user: "James",
      deviceId: "living-room-tv",
      channel: { number: 101, name: "90s Sitcoms", callsign: "SITCOM" },
      state: "program",
      playbackState: "playing",
      title: "The One With the Blackout",
      showTitle: "Friends",
      season: 1,
      episode: 7,
      year: 1994,
      artworkUrl: "/api/public/v1/channels/clx9k2p0a0001abcd/artwork/45210?kind=poster",
      progress: { positionSeconds: 540, durationSeconds: 1320 },
      startedAt: "2026-09-27T18:10:00.000Z",
      device: { id: "living-room-tv", platform: "roku", model: "Streaming Stick 4K", osVersion: "15.3.4", hdr: true },
    },
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSession(s: any): z.infer<typeof SessionDTO> {
  return {
    id: s.id,
    user: s.user,
    deviceId: s.deviceId ?? "legacy",
    channel: s.channel
      ? { number: s.channel.number, name: s.channel.name, callsign: s.channel.callsign ?? null }
      : null,
    state: s.state,
    playbackState: s.playbackState ?? null,
    title: s.title ?? null,
    showTitle: s.showTitle ?? null,
    season: s.season ?? null,
    episode: s.episode ?? null,
    year: s.year ?? null,
    artworkUrl: buildArtworkUrl(s.channelId, s.posterRatingKey, "poster"),
    progress: s.progress
      ? { positionSeconds: s.progress.positionSeconds, durationSeconds: s.progress.durationSeconds }
      : null,
    startedAt: (s.startedAt instanceof Date ? s.startedAt : new Date(s.startedAt)).toISOString(),
    device: s.device
      ? {
          id: s.device.id ?? null,
          platform: s.device.platform ?? null,
          model: s.device.model ?? null,
          osVersion: s.device.osVersion ?? null,
          hdr: s.device.hdr ?? null,
        }
      : null,
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
                  artworkUrl: z.string().nullable(),
                  progress: z
                    .object({ positionSeconds: z.number(), durationSeconds: z.number() })
                    .nullable(),
                  device: z
                    .object({ model: z.string().nullable(), platform: z.string().nullable() })
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
          artworkUrl: buildArtworkUrl(s.channelId, s.posterRatingKey, "poster"),
          progress: s.progress
            ? { positionSeconds: s.progress.positionSeconds, durationSeconds: s.progress.durationSeconds }
            : null,
          device: s.device ? { model: s.device.model ?? null, platform: s.device.platform ?? null } : null,
        })),
      },
      200,
    );
  },
);
