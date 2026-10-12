import { z } from "zod";

import { adminProcedure, router } from "../index";
import { exportLineup } from "../services/transfer/export";
import { type ImportedLineup, previewImport } from "../services/transfer/import";
import { isImportRunnerAvailable, requireImportRunner } from "../services/transfer/import-runner";
import { getAppSettings } from "../services/settings";
import { lineupEnvelopeSchema } from "../services/transfer/schema";
import { listImportRuns, listImportRunSteps } from "../services/transfer/import-runs";
import { listImportRunTraces } from "../services/transfer/import-trace";

// The tolerant versioned envelope lives in services/transfer/schema.ts (shared with the migration chain):
// known fields typed, nested contents loose, extras passed through, and the version field optional so a
// legacy integer `version` or a newer-minor file still parses. The service normalizes it via migrateToCurrent.
const importedLineup = lineupEnvelopeSchema;

/**
 * Lineup transfer between Airwave instances — export the full lineup (packages + channels) as a portable
 * JSON blob, preview an uploaded file against this instance (staging), and (next) import it via a durable
 * workflow. See `services/transfer/`.
 */
export const transferRouter = router({
  /** The full lineup as a portable JSON object; the client serializes it to a download. */
  export: adminProcedure.query(({ ctx }) => exportLineup(ctx.prisma)),

  /** The same versioned document, narrowed to a selection — one channel, one package, or a hand-picked set
   *  (what sharing a single channel/package to the marketplace needs). Omit both for the whole lineup. */
  exportSelection: adminProcedure
    .input(
      z.object({
        channelNumbers: z.array(z.number().int()).optional(),
        packageKeys: z.array(z.string()).optional(),
      }),
    )
    .query(({ ctx, input }) => exportLineup(ctx.prisma, input)),

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
    .mutation(async ({ ctx, input }) => {
      const settings = await getAppSettings(ctx.prisma);
      return requireImportRunner().start({
        data: input.data as ImportedLineup,
        selectedNumbers: input.selectedNumbers,
        targetSourceId: input.targetSourceId,
        dryRun: input.dryRun,
        userId: ctx.session.user.id,
        concurrency: settings.importConcurrency,
      });
    }),

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
