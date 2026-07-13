import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { getPlaybackInfo } from "../services/plex/client";
import { getNowNext } from "../services/schedule/generate";

/**
 * Playback brokering for the (admin-side) preview player. Resolves what's on a channel
 * *now* into a directly-playable Plex URL at the live offset — proving the direct-play-
 * at-offset path in the browser before the webOS client. See `.docs/playback-model.md`.
 */
export const playbackRouter = router({
  resolve: adminProcedure
    .input(z.object({ channelId: z.string() }))
    .query(async ({ ctx, input }) => {
      const channel = await ctx.prisma.channel.findUnique({
        where: { id: input.channelId },
        include: { mediaSource: true },
      });
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found." });
      const source = channel.mediaSource;
      if (!source?.baseUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Source is not connected." });
      }

      const nn = await getNowNext(ctx.prisma, input.channelId);
      const clientId = source.clientIdentifier ?? "channelguide-server";

      // Between programs (or a stale/empty schedule): nothing to direct-play right now.
      if (!nn.current) {
        return { state: "off" as const, endsAt: nn.endsAt, next: nn.next };
      }
      if (nn.current.kind === "BUMPER" || !nn.current.ratingKey) {
        return {
          state: "bumper" as const,
          guide: nn.current.guide,
          startsAt: nn.current.startsAt,
          durationSeconds: nn.current.durationSeconds,
          offsetSeconds: nn.current.offsetSeconds,
          next: nn.next,
          endsAt: nn.endsAt,
        };
      }

      const info = await getPlaybackInfo(
        source.baseUrl,
        source.token,
        clientId,
        nn.current.ratingKey,
        nn.current.offsetSeconds,
      );
      if (!info) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No playable media part for this item." });
      }

      return {
        state: "program" as const,
        mode: info.mode,
        url: info.url,
        // For 'direct' the client seeks here; for 'hls' the offset is already baked in.
        offsetSeconds: nn.current.offsetSeconds,
        container: info.container,
        videoCodec: info.videoCodec,
        audioCodec: info.audioCodec,
        ratingKey: nn.current.ratingKey,
        startsAt: nn.current.startsAt,
        durationSeconds: nn.current.durationSeconds,
        guide: nn.current.guide,
        next: nn.next,
        endsAt: nn.endsAt,
      };
    }),
});
