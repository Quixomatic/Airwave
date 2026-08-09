import { Prisma, type PrismaClient } from "@airwave/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { toAccentKey } from "../services/accents";

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
  // Server-side search / filter / sort (the UI drives it via URL params). Input is optional so
  // no-arg callers (e.g. the channel form / channels filter) still get the full list.
  list: adminProcedure
    .input(
      z
        .object({
          q: z.string().optional(),
          // Provenance: preset (static generator), ai (AI lineup), or manual (neither flag).
          gen: z.enum(["preset", "ai", "manual"]).optional(),
          sort: z.enum(["order", "name", "channels"]).optional(),
          dir: z.enum(["asc", "desc"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const q = input?.q?.trim();
      const sort = input?.sort ?? "order";
      const dir = input?.dir ?? "asc";

      const where: Prisma.ChannelPackageWhereInput = {};
      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ];
      }
      if (input?.gen === "preset") where.generated = true;
      else if (input?.gen === "ai") where.aiGenerated = true;
      else if (input?.gen === "manual") {
        where.generated = false;
        where.aiGenerated = false;
      }

      const byName: Prisma.ChannelPackageOrderByWithRelationInput = { name: "asc" };
      const orderBy: Prisma.ChannelPackageOrderByWithRelationInput[] =
        sort === "name"
          ? [{ name: dir }]
          : sort === "channels"
            ? [{ channels: { _count: dir } }, byName]
            : [{ sortIndex: dir }, byName]; // "order" (default)

      const packages = await ctx.prisma.channelPackage.findMany({
        where,
        orderBy,
        include: { _count: { select: { channels: true } } },
      });
      return packages.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
        icon: p.icon,
        tint: p.tint,
        generated: p.generated,
        aiGenerated: p.aiGenerated,
        channelCount: p._count.channels,
      }));
    }),

  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const pkg = await ctx.prisma.channelPackage.findUnique({
      where: { id: input.id },
      include: {
        channels: {
          orderBy: { number: "asc" },
          select: {
            id: true,
            number: true,
            name: true,
            enabled: true,
            callsign: true,
            icon: true,
            tint: true,
            ordering: true,
          },
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
        tint: z.string().nullish().transform((v) => (v ? toAccentKey(v) : null)), // coerce to a valid accent key
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
        tint: z.string().nullish().transform((v) => (v ? toAccentKey(v) : null)), // coerce to a valid accent key
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
