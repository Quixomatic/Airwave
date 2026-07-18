import { z } from "zod";

import { adminProcedure, router } from "../index";
import {
  createConnection,
  deleteConnection,
  listConnections,
  setActiveConnection,
  testConnection,
  updateConnection,
} from "../services/agent/config";
import { deleteConversation, getConversationMessages, listConversations } from "../services/agent/conversations";

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

  /** A cheap round-trip that proves the connection's model actually responds. */
  test: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => testConnection(ctx.prisma, input.id)),

  // --- chat history ---
  conversations: adminProcedure.query(({ ctx }) => listConversations(ctx.prisma, ctx.session.user.id)),
  messages: adminProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => getConversationMessages(ctx.prisma, ctx.session.user.id, input.id)),
  deleteConversation: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => deleteConversation(ctx.prisma, ctx.session.user.id, input.id)),
});
