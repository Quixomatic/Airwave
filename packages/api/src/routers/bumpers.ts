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
        // Ambient bumper music (§7.14) — global controls; the library is managed via `bumperMusic.*`.
        musicEnabled: z.boolean().optional(),
        musicVolume: z.number().int().min(0).max(100).optional(),
        musicFadeInMs: z.number().int().min(0).max(10_000).optional(),
        musicFadeOutMs: z.number().int().min(0).max(10_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await getGlobalBumperConfig(ctx.prisma);
      // Only STRUCTURAL settings change the materialized schedule (bumper presence + break DURATIONS baked
      // into the timeline — the fields `resolveBumperPlan`/`breakSeconds` read). Everything else here is
      // PLAYBACK-ONLY, read by the client at play time: the ambient-music controls (musicEnabled/volume/
      // fades — the bed is DVR-derived client-side), the "Up Next" card style, and the legacy music key.
      // So only bump `rev` (→ schedule-bumper-sync rebuilds every stale channel) when a structural field
      // actually changed value — otherwise flipping e.g. bumper music on/off needlessly regenerates every
      // channel's schedule from scratch.
      const structuralChanged =
        input.enabled !== existing.enabled ||
        input.interstitialSeconds !== existing.interstitialSeconds ||
        input.afterMovieSeconds !== existing.afterMovieSeconds ||
        input.afterEpisodeSeconds !== existing.afterEpisodeSeconds ||
        input.quickSeconds !== existing.quickSeconds ||
        input.shortEpisodeMinutes !== existing.shortEpisodeMinutes;
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
          ...(input.musicEnabled !== undefined ? { musicEnabled: input.musicEnabled } : {}),
          ...(input.musicVolume !== undefined ? { musicVolume: input.musicVolume } : {}),
          ...(input.musicFadeInMs !== undefined ? { musicFadeInMs: input.musicFadeInMs } : {}),
          ...(input.musicFadeOutMs !== undefined ? { musicFadeOutMs: input.musicFadeOutMs } : {}),
          // Advance the rev ONLY on a structural change; channels built under an older rev become stale and
          // get rebuilt by the schedule-bumper-sync job. Playback-only changes leave every schedule intact.
          ...(structuralChanged ? { rev: { increment: 1 } } : {}),
        },
      });
      // Reconcile only when a structural change actually happened (it self-throttles to a batch per run and
      // the cron picks up the rest). Skipping it on playback-only saves avoids a needless full-lineup rebuild.
      if (structuralChanged) void runJob("schedule-bumper-sync");
      return { ok: true };
    }),
});
