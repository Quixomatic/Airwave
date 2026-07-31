import { z } from "zod";

import { adminProcedure, router } from "../index";
import {
  listMusic,
  removeMusic,
  renameMusic,
  scanMusicDir,
  setMusicEnabled,
} from "../services/bumper-music/library";

/**
 * Admin management of the bumper-music library (§7.14). Uploads go through a multipart REST endpoint
 * (`POST /api/admin/bumper-music`) since tRPC is JSON-only; everything else — list, toggle, rename, delete,
 * and the folder scan — is here. adminProcedure only.
 */
export const bumperMusicRouter = router({
  list: adminProcedure.query(({ ctx }) => listMusic(ctx.prisma)),

  setEnabled: adminProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(({ ctx, input }) => setMusicEnabled(ctx.prisma, input.id, input.enabled)),

  rename: adminProcedure
    .input(z.object({ id: z.string(), title: z.string().min(1) }))
    .mutation(({ ctx, input }) => renameMusic(ctx.prisma, input.id, input.title)),

  remove: adminProcedure
    .input(z.object({ id: z.string(), deleteFile: z.boolean().optional() }))
    .mutation(({ ctx, input }) => removeMusic(ctx.prisma, input.id, input.deleteFile ?? true)),

  /** Reconcile the index with the volume — indexes dropped-in files, flags missing ones. Returns a summary. */
  scan: adminProcedure.mutation(({ ctx }) => scanMusicDir(ctx.prisma)),
});
