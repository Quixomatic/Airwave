import type { PrismaClient } from "@ChannelGuide/db";

/** Chat-history reads/writes for the assistant panel (scoped to the requesting user). */

export async function listConversations(prisma: PrismaClient, userId: string) {
  return prisma.aiConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
    take: 50,
  });
}

/** A conversation's messages shaped as AI SDK UIMessages (id / role / parts) for `useChat`. */
export async function getConversationMessages(prisma: PrismaClient, userId: string, conversationId: string) {
  const conv = await prisma.aiConversation.findFirst({ where: { id: conversationId, userId }, select: { id: true } });
  if (!conv) return [];
  const rows = await prisma.aiMessage.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
  return rows.map((m) => ({ id: m.id, role: m.role, parts: m.parts }));
}

export async function deleteConversation(prisma: PrismaClient, userId: string, id: string) {
  await prisma.aiConversation.deleteMany({ where: { id, userId } });
  return listConversations(prisma, userId);
}
