import { z } from "zod";

import { adminProcedure, router } from "../index";
import { getGlobalBumperConfig } from "../services/bumpers/bumper-config";
import { runJob } from "../services/jobs/scheduler";

export const bumpersRouter = router({
  /** The global bumper config (singleton; created on first read). */
  get: adminProcedure.query(({ ctx }) => getGlobalBumperConfig(ctx.prisma)),

  /** Update the global bumper config. Break lengths are contextual tiers (chosen per
   *  program transition). Bumps `rev` so Bumper Sync reconciles existing schedules.
   *  Commercial media sources land with a later milestone. */
  update: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        interstitialSeconds: z.number().int().min(1).max(600),
        afterMovieSeconds: z.number().int().min(1).max(600),
        afterEpisodeSeconds: z.number().int().min(1).max(600),
        quickSeconds: z.number().int().min(1).max(600),
        shortEpisodeMinutes: z.number().int().min(1).max(240),
        interstitialStyle: z.string().min(1).optional(),
        interstitialMusicKey: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getGlobalBumperConfig(ctx.prisma);
      await ctx.prisma.bumperConfig.update({
        where: { id: existing.id },
        data: {
          enabled: input.enabled,
          interstitialSeconds: input.interstitialSeconds,
          afterMovieSeconds: input.afterMovieSeconds,
          afterEpisodeSeconds: input.afterEpisodeSeconds,
          quickSeconds: input.quickSeconds,
          shortEpisodeMinutes: input.shortEpisodeMinutes,
          ...(input.interstitialStyle ? { interstitialStyle: input.interstitialStyle } : {}),
          interstitialMusicKey: input.interstitialMusicKey ?? null,
          // Any settings change advances the rev; channels built under an older rev
          // become stale and get rebuilt by the schedule-bumper-sync job.
          rev: { increment: 1 },
        },
      });
      // Kick off the reconcile immediately (it self-throttles to a batch per run and
      // the cron picks up the rest); no-ops when nothing is stale.
      void runJob("schedule-bumper-sync");
      return { ok: true };
    }),
});
