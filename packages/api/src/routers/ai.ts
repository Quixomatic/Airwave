import { z } from "zod";

import { adminProcedure, router } from "../index";
import {
  CONNECTION_ROLES,
  createConnection,
  deleteConnection,
  listConnections,
  setActiveConnection,
  setConnectionRole,
  testConnection,
  updateConnection,
} from "../services/agent/config";
import { deleteConversation, getConversationMessages, listConversations } from "../services/agent/conversations";
import { listLineupRunSteps, listLineupRuns } from "../services/agent/lineup-runs";
import { isLineupRunnerAvailable, requireLineupRunner } from "../services/agent/lineup-runner";
import { listRunTraces, summarizeRunUsage } from "../services/agent/lineup-trace";
import { getSourceReadiness, notReadyReason } from "../services/sources/readiness";
import { TRPCError } from "@trpc/server";

const connectionInput = z.object({
  name: z.string().min(1),
  provider: z.enum(["anthropic", "openai", "google", "compatible"]),
  model: z.string().min(1),
  baseUrl: z.string().optional().nullable(),
  apiKey: z.string().optional(), // undefined = leave unchanged; "" = clear; string = set
});

export const aiRouter = router({
  /** All saved connections (active first). Never returns keys — just `hasKey`. */
  list: adminProcedure.query(({ ctx }) => listConnections(ctx.prisma)),

  create: adminProcedure.input(connectionInput).mutation(({ ctx, input }) => createConnection(ctx.prisma, input)),

  update: adminProcedure
    .input(z.object({ id: z.string() }).and(connectionInput))
    .mutation(({ ctx, input }) => updateConnection(ctx.prisma, input.id, input)),

  delete: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => deleteConnection(ctx.prisma, input.id)),

  setActive: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => setActiveConnection(ctx.prisma, input.id)),

  /**
   * Assign a role to a connection. `active` = the chat; `planner` = the lineup's one big reasoning
   * call; `worker` = the ~50 per-channel build loops (where a cheap model saves the most).
   * Unassigned roles fall back to the active connection.
   */
  setRole: adminProcedure
    .input(
      z.object({
        id: z.string(),
        role: z.enum(CONNECTION_ROLES),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => setConnectionRole(ctx.prisma, input.id, input.role, input.enabled ?? true)),

  /** A cheap round-trip that proves the connection's model actually responds. */
  test: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => testConnection(ctx.prisma, input.id)),

  // --- the durable lineup workflow (§7.3a) ---
  // These delegate to a runner the SERVER registers at startup — the workflow itself
  // lives in apps/server/workflows and packages/api can't import it. See lineup-runner.ts.

  /** Whether the workflow engine is wired up, so the UI can hide the action if not. */
  lineupAvailable: adminProcedure.query(() => ({ available: isLineupRunnerAvailable() })),

  /**
   * Kick off a full AI lineup build. Returns immediately with a runId — the run outlives
   * this request and survives a server restart. DESTRUCTIVE on re-run: it wipes existing
   * `aiGenerated` rows, so the caller must confirm first (§5).
   */
  buildLineup: adminProcedure
    .input(
      z.object({
        sourceId: z.string(),
        mode: z.enum(["quality", "fast"]).optional(),
        limit: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Same shared gate as channel creation: the lineup builds channels, so the target source must be
      // connected + fully synced. (Backstops the source-agnostic ai-lineup-build job's own check.)
      const readiness = await getSourceReadiness(ctx.prisma, input.sourceId);
      if (!readiness?.ready) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: readiness ? notReadyReason(readiness.fields, "build an AI lineup")! : "Media source not found.",
        });
      }
      return requireLineupRunner().start({ ...input, userId: ctx.session.user.id });
    }),

  /** Recent AI lineup runs for the observability page (metadata + step counts). */
  lineupRuns: adminProcedure
    .input(z.object({ limit: z.number().int().positive().max(100).optional() }).optional())
    .query(({ ctx, input }) => listLineupRuns(ctx.prisma, input?.limit ?? 20)),

  /** Every step of one run — the fan-out breakdown for the observability page. */
  lineupRunSteps: adminProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ ctx, input }) => listLineupRunSteps(ctx.prisma, input.runId)),

  /**
   * What the MODEL did, per step and per attempt — the run detail page's substance.
   * Distinct from `lineupRunSteps`, which is the SDK's outside view (name/status/duration).
   */
  lineupRunTraces: adminProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ ctx, input }) => listRunTraces(ctx.prisma, input.runId)),

  /**
   * True spend for a run, grouped by model and phase — including retries and the planner
   * call, both of which the build-only report left out.
   */
  lineupRunUsage: adminProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ ctx, input }) => summarizeRunUsage(ctx.prisma, input.runId)),

  /** Poll a run's status/progress. `running` covers "suspended between steps" too. */
  lineupRun: adminProcedure
    .input(z.object({ runId: z.string() }))
    .query(({ input }) => requireLineupRunner().status(input.runId)),

  cancelLineupRun: adminProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ input }) => {
      await requireLineupRunner().cancel(input.runId);
      return { cancelled: true };
    }),

  // --- chat history ---
  conversations: adminProcedure.query(({ ctx }) => listConversations(ctx.prisma, ctx.session.user.id)),
  messages: adminProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => getConversationMessages(ctx.prisma, ctx.session.user.id, input.id)),
  deleteConversation: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => deleteConversation(ctx.prisma, ctx.session.user.id, input.id)),
});
