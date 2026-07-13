import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { generateLineup } from "../services/generator/generate";

export const generatorRouter = router({
  /** Refresh only the generated packages' metadata (name / icon / tint / …). */
  regeneratePackages: adminProcedure.mutation(async ({ ctx }) => {
    const source = await ctx.prisma.mediaSource.findFirst({ where: { enabled: true } });
    if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "No connected source." });
    return generateLineup(ctx.prisma, source.id, { scope: "packages" });
  }),

  /** Rebuild the channels of one generated package. */
  regeneratePackage: adminProcedure
    .input(z.object({ packageKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.prisma.mediaSource.findFirst({ where: { enabled: true } });
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "No connected source." });
      return generateLineup(ctx.prisma, source.id, { scope: { packageKey: input.packageKey } });
    }),
});
