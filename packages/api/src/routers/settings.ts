import { z } from "zod";

import { adminProcedure, router } from "../index";
import { getAppSettings, updateAppSettings } from "../services/settings";

/** App-wide singleton settings (see services/settings). Admin-only. */
export const settingsRouter = router({
  get: adminProcedure.query(({ ctx }) => getAppSettings(ctx.prisma)),
  update: adminProcedure
    .input(
      z.object({
        channelBuildConcurrency: z.number().int().min(1).max(16).optional(),
        importConcurrency: z.number().int().min(1).max(16).optional(),
      }),
    )
    .mutation(({ ctx, input }) => updateAppSettings(ctx.prisma, input)),
});
