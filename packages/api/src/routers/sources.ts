import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { syncLibraries } from "../services/plex/sync-libraries";

export const sourcesRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    const sources = await ctx.prisma.mediaSource.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        baseUrl: true,
        machineIdentifier: true,
        enabled: true,
        _count: { select: { mediaItems: true } },
      },
    });
    // Derive readiness for channel creation: a source is usable only once it's CONNECTED (enabled +
    // a resolved baseUrl) and SYNCED (its metadata cache has at least one item to build from).
    return sources.map(({ _count, ...s }) => {
      const connected = s.enabled && s.baseUrl != null;
      const synced = _count.mediaItems > 0;
      return { ...s, itemCount: _count.mediaItems, connected, synced, ready: connected && synced };
    });
  }),

  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const source = await ctx.prisma.mediaSource.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        name: true,
        type: true,
        baseUrl: true,
        machineIdentifier: true,
        webAppUrl: true,
        enabled: true,
        libraries: {
          orderBy: { title: "asc" },
          select: {
            id: true,
            key: true,
            title: true,
            type: true,
            enabled: true,
            lastScanAt: true,
          },
        },
      },
    });
    if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found." });
    return source;
  }),

  updateLabel: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.mediaSource.update({
        where: { id: input.id },
        data: { name: input.name },
      });
      return { ok: true };
    }),

  rescan: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const source = await ctx.prisma.mediaSource.findUnique({ where: { id: input.id } });
    if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Source not found." });
    return syncLibraries(ctx.prisma, source);
  }),

  setLibraryEnabled: adminProcedure
    .input(z.object({ libraryId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.mediaLibrary.update({
        where: { id: input.libraryId },
        data: { enabled: input.enabled },
      });
      return { ok: true };
    }),

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.mediaSource.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
