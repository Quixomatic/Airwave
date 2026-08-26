import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { syncLibraries } from "../services/plex/sync-libraries";
import { sourceReadiness } from "../services/sources/readiness";

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
        syncStatus: true,
        lastSyncedAt: true,
        lastSyncError: true,
        _count: { select: { mediaItems: true } },
      },
    });
    // Derive readiness from the ONE shared helper: CONNECTED (enabled + resolved baseUrl) and SYNCED
    // (a full metadata sync has COMPLETED — syncStatus, not a raw item count). Exposes connected /
    // syncing / synced / failed / ready so the UI can show the right badge + a live "syncing" spinner.
    return sources.map(({ _count, ...s }) => ({
      ...s,
      itemCount: _count.mediaItems,
      ...sourceReadiness(s),
    }));
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
        syncStatus: true,
        lastSyncedAt: true,
        lastSyncError: true,
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
    // Same derived readiness as `list` so the detail page shows the honest status badge.
    return { ...source, ...sourceReadiness(source) };
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
