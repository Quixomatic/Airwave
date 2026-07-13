import type { PrismaClient } from "@ChannelGuide/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { getPlaybackInfo, stopTranscode } from "../services/plex/client";
import { QUALITY_PRESETS } from "../services/plex/quality";
import { getChannelTimeline } from "../services/schedule/generate";

/** A session is "active" while it's heartbeated within this window. */
const SESSION_ACTIVE_MS = 30_000;

async function channelSource(prisma: PrismaClient, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { mediaSource: true },
  });
  if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found." });
  const source = channel.mediaSource;
  if (!source?.baseUrl) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Source is not connected." });
  }
  return { channel, source, clientId: source.clientIdentifier ?? "channelguide-server" };
}

/**
 * Playback brokering + in-house session tracking for the (admin-side) preview player.
 * We deliberately don't report to Plex (§8a of `.docs/playback-model.md`), so watch
 * sessions live here instead. See also `.docs/playback-model.md`.
 */
export const playbackRouter = router({
  /** A window of the channel timeline (past → future) for the client state machine. */
  timeline: adminProcedure
    .input(
      z.object({
        channelId: z.string(),
        backMinutes: z.number().int().min(0).max(1440).default(360),
        forwardMinutes: z.number().int().min(30).max(1440).default(180),
      }),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const from = new Date(now.getTime() - input.backMinutes * 60_000);
      const to = new Date(now.getTime() + input.forwardMinutes * 60_000);
      const slots = await getChannelTimeline(ctx.prisma, input.channelId, from, to);
      return { serverTime: now, slots };
    }),

  /** The Plex-style quality ladder for the player's quality selector. */
  qualities: adminProcedure.query(() =>
    QUALITY_PRESETS.map((q) => ({ id: q.id, label: q.label })),
  ),

  /** Resolve a playable URL for a specific item at a specific offset (client-driven). */
  media: adminProcedure
    .input(
      z.object({
        channelId: z.string(),
        ratingKey: z.string(),
        offsetSeconds: z.number().int().min(0),
        quality: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { source, clientId } = await channelSource(ctx.prisma, input.channelId);
      const info = await getPlaybackInfo(
        source.baseUrl!,
        source.token,
        clientId,
        input.ratingKey,
        input.offsetSeconds,
        input.quality,
      );
      if (!info) throw new TRPCError({ code: "NOT_FOUND", message: "No playable media part." });
      return { ...info, offsetSeconds: input.offsetSeconds };
    }),

  /** Stop a Plex transcode session (client calls on program change / teardown). */
  stop: adminProcedure
    .input(z.object({ channelId: z.string(), session: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { source, clientId } = await channelSource(ctx.prisma, input.channelId);
      await stopTranscode(source.baseUrl!, source.token, clientId, input.session);
      return { ok: true };
    }),

  /** Upsert the current user's live watch session (client heartbeats ~every 10s). */
  heartbeat: adminProcedure
    .input(
      z.object({
        channelId: z.string(),
        state: z.enum(["program", "bumper", "off"]),
        ratingKey: z.string().nullish(),
        title: z.string().nullish(),
        delaySeconds: z.number().int().min(0).default(0),
        transcodeSession: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const now = new Date();
      const data = {
        channelId: input.channelId,
        state: input.state,
        ratingKey: input.ratingKey ?? null,
        title: input.title ?? null,
        delaySeconds: input.delaySeconds,
        transcodeSession: input.transcodeSession ?? null,
        lastHeartbeatAt: now,
      };
      await ctx.prisma.watchSession.upsert({
        where: { userId },
        create: { userId, startedAt: now, ...data },
        update: data,
      });
      return { ok: true };
    }),

  /** End the current user's session (+ best-effort stop its transcode). */
  endSession: adminProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const existing = await ctx.prisma.watchSession.findUnique({
      where: { userId },
      include: { channel: { include: { mediaSource: true } } },
    });
    if (!existing) return { ok: true };
    const src = existing.channel?.mediaSource;
    if (existing.transcodeSession && src?.baseUrl) {
      await stopTranscode(
        src.baseUrl,
        src.token,
        src.clientIdentifier ?? "channelguide-server",
        existing.transcodeSession,
      );
    }
    await ctx.prisma.watchSession.delete({ where: { userId } });
    return { ok: true };
  }),

  /** Active watch sessions — the admin "Now Watching" view. */
  sessions: adminProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - SESSION_ACTIVE_MS);
    const rows = await ctx.prisma.watchSession.findMany({
      where: { lastHeartbeatAt: { gte: since } },
      orderBy: { startedAt: "asc" },
      include: {
        user: { select: { name: true, email: true } },
        channel: { select: { number: true, name: true, callsign: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      user: r.user.name || r.user.email,
      channel: r.channel ? { number: r.channel.number, name: r.channel.name, callsign: r.channel.callsign } : null,
      state: r.state,
      title: r.title,
      delaySeconds: r.delaySeconds,
      startedAt: r.startedAt,
    }));
  }),
});
