import { z } from "zod";

import { adminProcedure, router } from "../index";
import { exportLineup } from "../services/transfer/export";
import { type ImportedLineup, previewImport } from "../services/transfer/import";

// Tolerant envelope for an uploaded lineup file — known fields typed, extras passed through (an
// older/other instance may include more). Deep filter/definition contents stay loose.
const importedDefinition = z
  .object({
    kind: z.string(),
    mode: z.string().optional(),
    sortIndex: z.number().optional(),
    plexFilter: z.unknown().optional(),
    plexLibraryTitle: z.string().nullish(),
  })
  .passthrough();
const importedChannel = z
  .object({
    number: z.number(),
    name: z.string(),
    callsign: z.string().nullish(),
    description: z.string().nullish(),
    icon: z.string().nullish(),
    tint: z.string().nullish(),
    enabled: z.boolean().optional(),
    sortIndex: z.number().optional(),
    ordering: z.string().optional(),
    sortField: z.string().optional(),
    sortDir: z.string().optional(),
    bumperMode: z.string().optional(),
    packageKey: z.string().nullish(),
    definitions: z.array(importedDefinition).optional(),
  })
  .passthrough();
const importedPackage = z
  .object({
    key: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    icon: z.string().nullish(),
    tint: z.string().nullish(),
    sortIndex: z.number().optional(),
  })
  .passthrough();
const importedLineup = z.object({
  version: z.number(),
  exportedAt: z.string().optional(),
  packages: z.array(importedPackage),
  channels: z.array(importedChannel),
});

/**
 * Lineup transfer between Airwave instances — export the full lineup (packages + channels) as a portable
 * JSON blob, preview an uploaded file against this instance (staging), and (next) import it via a durable
 * workflow. See `services/transfer/`.
 */
export const transferRouter = router({
  /** The full lineup as a portable JSON object; the client serializes it to a download. */
  export: adminProcedure.query(({ ctx }) => exportLineup(ctx.prisma)),

  /** Read-only: annotate an uploaded lineup against this instance for the staging screen. A mutation (not a
   *  query) so the uploaded JSON rides the POST body, not a length-limited URL. */
  importPreview: adminProcedure
    .input(z.object({ data: importedLineup, targetSourceId: z.string() }))
    .mutation(({ ctx, input }) => previewImport(ctx.prisma, input.data as ImportedLineup, input.targetSourceId)),
});
