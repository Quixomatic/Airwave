import { z } from "zod";

import { adminProcedure, router } from "../index";
import { getUserAccess, setUserAccess } from "../services/access/access";

export const usersRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        allAccess: true,
        createdAt: true,
      },
    });
  }),

  /** One user's profile (for the detail page). */
  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    return ctx.prisma.user.findUnique({
      where: { id: input.id },
      select: { id: true, email: true, name: true, role: true, image: true, allAccess: true, createdAt: true },
    });
  }),

  /** A user's access config + the package/channel catalog for the access grid (§7.13). */
  getAccess: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => getUserAccess(ctx.prisma, input.id)),

  /** Replace a user's access config in one transaction (the grid's Save). */
  setAccess: adminProcedure
    .input(
      z.object({
        id: z.string(),
        allAccess: z.boolean(),
        packages: z.array(z.object({ packageId: z.string(), mode: z.enum(["FULL", "PARTIAL"]) })).optional(),
        channelIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      setUserAccess(ctx.prisma, input.id, {
        allAccess: input.allAccess,
        packages: input.packages,
        channelIds: input.channelIds,
      }),
    ),
});
