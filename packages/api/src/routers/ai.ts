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
import { isLineupRunnerAvailable, requireLineupRunner } from "../services/agent/lineup-runner";

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
    .mutation(({ ctx, input }) =>
      requireLineupRunner().start({ ...input, userId: ctx.session.user.id }),
    ),

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
