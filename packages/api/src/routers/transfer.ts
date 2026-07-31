import { z } from "zod";

import { adminProcedure, router } from "../index";
import { exportLineup } from "../services/transfer/export";
import { type ImportedLineup, previewImport } from "../services/transfer/import";
import { isImportRunnerAvailable, requireImportRunner } from "../services/transfer/import-runner";
import { listImportRuns, listImportRunSteps } from "../services/transfer/import-runs";
import { listImportRunTraces } from "../services/transfer/import-trace";

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

  /** Whether the durable import workflow engine is wired up (WORKFLOW_ENABLED). Gates the Import button. */
  importAvailable: adminProcedure.query(() => ({ available: isImportRunnerAvailable() })),

  /** Kick off the durable import workflow. Returns a runId to watch on the run page. `dryRun` validates +
   *  resolves + traces but writes nothing. */
  import: adminProcedure
    .input(
      z.object({
        data: importedLineup,
        selectedNumbers: z.array(z.number()).optional(),
        targetSourceId: z.string(),
        dryRun: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      requireImportRunner().start({
        data: input.data as ImportedLineup,
        selectedNumbers: input.selectedNumbers,
        targetSourceId: input.targetSourceId,
        dryRun: input.dryRun,
        userId: ctx.session.user.id,
      }),
    ),

  /** Recent import runs for the observability page (metadata + step counts). */
  importRuns: adminProcedure
    .input(z.object({ limit: z.number().int().positive().max(100).optional() }).optional())
    .query(({ ctx, input }) => listImportRuns(ctx.prisma, input?.limit ?? 20)),

  /** Every step of one import run — the SDK's outside view (name/status/duration). */
  importRunSteps: adminProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ ctx, input }) => listImportRunSteps(ctx.prisma, input.runId)),

  /** Per-package / per-channel outcomes for one run — the run detail page's substance. */
  importRunTraces: adminProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ ctx, input }) => listImportRunTraces(ctx.prisma, input.runId)),

  /** Poll a run's status/progress. `running` covers "suspended between steps" too. */
  importRun: adminProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ input }) => requireImportRunner().status(input.runId)),
});
