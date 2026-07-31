import { z } from "zod";

import { adminProcedure, router } from "../index";
import { accessibleChannels, getUserAccess, setUserAccess } from "../services/access/access";

export const usersRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const [users, totalChannels] = await Promise.all([
      ctx.prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, name: true, role: true, image: true, allAccess: true, createdAt: true },
      }),
      ctx.prisma.channel.count({ where: { enabled: true } }),
    ]);

    // How many ENABLED channels each restricted user can actually see (`accessCount: null` = all). Admins +
    // all-access users skip the resolve; only restricted users cost the extra query (fine at self-host scale).
    const enriched = await Promise.all(
      users.map(async (u) => {
        if (u.role === "admin" || u.allAccess) return { ...u, accessCount: null as number | null };
        const acc = await accessibleChannels(ctx.prisma, u.id);
        if (acc === "all") return { ...u, accessCount: null };
        const accessCount = acc.size
          ? await ctx.prisma.channel.count({ where: { enabled: true, id: { in: [...acc] } } })
          : 0;
        return { ...u, accessCount };
      }),
    );
    return { users: enriched, totalChannels };
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
