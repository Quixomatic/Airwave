import type { PrismaClient } from "@ChannelGuide/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "package";

async function uniqueKey(prisma: PrismaClient, base: string): Promise<string> {
  let key = base;
  for (let i = 2; await prisma.channelPackage.findUnique({ where: { key } }); i++) {
    key = `${base}-${i}`;
  }
  return key;
}

export const packagesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const packages = await ctx.prisma.channelPackage.findMany({
      orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
      include: { _count: { select: { channels: true } } },
    });
    return packages.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      icon: p.icon,
      tint: p.tint,
      channelCount: p._count.channels,
    }));
  }),

  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const pkg = await ctx.prisma.channelPackage.findUnique({
      where: { id: input.id },
      include: {
        channels: {
          orderBy: { number: "asc" },
          select: { id: true, number: true, name: true, enabled: true },
        },
      },
    });
    if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found." });
    return pkg;
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        icon: z.string().nullish(),
        tint: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const key = await uniqueKey(ctx.prisma, slugify(input.name));
      const sortIndex =
        ((await ctx.prisma.channelPackage.aggregate({ _max: { sortIndex: true } }))._max.sortIndex ??
          0) + 1;
      const pkg = await ctx.prisma.channelPackage.create({
        data: {
          key,
          name: input.name,
          description: input.description,
          icon: input.icon ?? null,
          tint: input.tint ?? null,
          sortIndex,
        },
      });
      return { id: pkg.id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        icon: z.string().nullish(),
        tint: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.channelPackage.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description ?? null,
          icon: input.icon ?? null,
          tint: input.tint ?? null,
        },
      });
      return { ok: true };
    }),

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    // Channels' packageId is set null via the schema's onDelete: SetNull.
    await ctx.prisma.channelPackage.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
