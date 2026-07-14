import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { ApiError } from "../services/errors";
import {
  getTimelineWindow,
  qualityList,
  resolveMedia,
  stopChannelTranscode,
} from "../services/playback/broker";
import {
  endWatchSession,
  heartbeatSession,
  listActiveSessions,
} from "../services/playback/sessions";

/** Map a service-layer ApiError onto tRPC's error codes. */
function toTRPC(err: unknown): never {
  if (err instanceof ApiError) {
    const code =
      err.status === 404
        ? "NOT_FOUND"
        : err.status === 412
          ? "PRECONDITION_FAILED"
          : err.status === 403
            ? "FORBIDDEN"
            : "BAD_REQUEST";
    throw new TRPCError({ code, message: err.message });
  }
  throw err;
}

/**
 * Playback brokering + in-house session tracking for the (admin-side) preview
 * player. Thin wrappers over the shared services in `services/playback/` +
 * `services/guide.ts` (the REST TV API mirrors the same services). We
 * deliberately don't report to Plex (§8a of `.docs/playback-model.md`).
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
    .query(({ ctx, input }) =>
      getTimelineWindow(ctx.prisma, input.channelId, input.backMinutes, input.forwardMinutes),
    ),

  /** The Plex-style quality ladder for the player's quality selector. */
  qualities: adminProcedure.query(() => qualityList()),

  /** Resolve a playable URL for a specific item at a specific offset (client-driven). */
  media: adminProcedure
    .input(
      z.object({
        channelId: z.string(),
        ratingKey: z.string(),
        offsetSeconds: z.number().int().min(0),
        quality: z.string().optional(),
        audioLang: z.string().optional(),
        subtitleLang: z.string().optional(),
      }),
    )
    .query(({ ctx, input }) =>
      resolveMedia(ctx.prisma, input.channelId, input.ratingKey, input.offsetSeconds, {
        quality: input.quality,
        audioLang: input.audioLang,
        subtitleLang: input.subtitleLang,
      }).catch(toTRPC),
    ),

  /** Stop a Plex transcode session (client calls on program change / teardown). */
  stop: adminProcedure
    .input(z.object({ channelId: z.string(), session: z.string() }))
    .mutation(({ ctx, input }) =>
      stopChannelTranscode(ctx.prisma, input.channelId, input.session).catch(toTRPC),
    ),

  /** Upsert the current user's live watch session (client heartbeats ~every 10s). */
  heartbeat: adminProcedure
    .input(
      z.object({
        channelId: z.string(),
        state: z.enum(["program", "bumper", "off"]),
        ratingKey: z.string().nullish(),
        title: z.string().nullish(),
        delaySeconds: z.number().int().min(0).default(0),
        positionAt: z.string().nullish(),
        transcodeSession: z.string().nullish(),
      }),
    )
    .mutation(({ ctx, input }) => heartbeatSession(ctx.prisma, ctx.session.user.id, input)),

  /** End the current user's session (+ best-effort stop its transcode). */
  endSession: adminProcedure.mutation(({ ctx }) =>
    endWatchSession(ctx.prisma, ctx.session.user.id),
  ),

  /** Active watch sessions — the admin "Now Watching" view. */
  sessions: adminProcedure.query(({ ctx }) => listActiveSessions(ctx.prisma)),
});
