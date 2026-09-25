import { z } from "zod";

import { adminProcedure, router } from "../index";
import { getAppSettings, getServerName, updateAppSettings } from "../services/settings";

/** App-wide singleton settings (see services/settings). Admin-only. */
export const settingsRouter = router({
  get: adminProcedure.query(async ({ ctx }) => {
    // Ensure the display name is seeded (self-heal) so the settings form always has one to show.
    await getServerName(ctx.prisma);
    return getAppSettings(ctx.prisma);
  }),
  update: adminProcedure
    .input(
      z.object({
        serverName: z.string().trim().min(1).max(60).optional(),
        channelBuildConcurrency: z.number().int().min(1).max(16).optional(),
        importConcurrency: z.number().int().min(1).max(16).optional(),
        plannerMaxOutputTokens: z.number().int().min(4000).max(128000).optional(),
      }),
    )
    .mutation(({ ctx, input }) => updateAppSettings(ctx.prisma, input)),
});
