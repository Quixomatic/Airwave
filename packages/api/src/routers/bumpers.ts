import { z } from "zod";

import { adminProcedure, router } from "../index";
import { getGlobalBumperConfig } from "../services/bumpers/bumper-config";

export const bumpersRouter = router({
  /** The global bumper config (singleton; created on first read). */
  get: adminProcedure.query(({ ctx }) => getGlobalBumperConfig(ctx.prisma)),

  /** Update the global bumper config. Only the interstitial fields are exposed for
   *  now — commercial media sources land with a later milestone. */
  update: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        interstitialSeconds: z.number().int().min(1).max(120),
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
          ...(input.interstitialStyle ? { interstitialStyle: input.interstitialStyle } : {}),
          interstitialMusicKey: input.interstitialMusicKey ?? null,
        },
      });
      return { ok: true };
    }),
});
