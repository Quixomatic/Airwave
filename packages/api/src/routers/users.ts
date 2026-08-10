import { auth } from "@airwave/auth";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { accessibleChannels, getUserAccess, setUserAccess } from "../services/access/access";

export const usersRouter = router({
  /**
   * Create a Viewer account with email + password (admin only). Uses better-auth's admin-plugin
   * `createUser` — the proper path that hashes the password and creates the credential `account`
   * row (a raw `prisma.user.create` can't do either). Public sign-up is disabled, so besides the
   * seeded admin and Import Plex Users this is the only way to make a password account. New users
   * inherit `allAccess = true` (schema default) — restrict them afterward on the access page.
   */
  create: adminProcedure
    .input(
      z.object({
        email: z.email(),
        name: z.string().min(1),
        password: z.string().min(8, "Password must be at least 8 characters."),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const res = await auth.api.createUser({
          body: {
            email: input.email.trim(),
            name: input.name.trim(),
            password: input.password,
            role: "user", // Viewer — there is only ever the one env-seeded admin.
          },
          // better-auth's admin plugin re-checks that the caller is an admin via the session cookie.
          headers: ctx.headers,
        });
        return { id: res.user.id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create user";
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: /exist/i.test(msg) ? "A user with that email already exists." : msg,
        });
      }
    }),

  /**
   * Delete a user (admin only). Uses better-auth's admin-plugin `removeUser` so their sessions and
   * credential account are cleaned up too; the access grants cascade via Prisma. Refuses to delete an
   * admin (there is only ever the one seeded owner), so the admin can never remove themselves.
   */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const target = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: { role: true },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
      if (target.role === "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin accounts can't be deleted." });
      }
      try {
        await auth.api.removeUser({ body: { userId: input.id }, headers: ctx.headers });
        return { ok: true as const };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Failed to delete user",
        });
      }
    }),

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
