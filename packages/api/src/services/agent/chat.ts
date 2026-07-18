import { Prisma, type PrismaClient } from "@ChannelGuide/db";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { getActiveModel } from "./config";

/**
 * The channel-building chat. Runs the active AI connection through the Vercel AI SDK and streams a
 * UI-message response back, persisting the exchange to the conversation (client owns the id). Tools
 * (library discovery, resolver preview, channel/package CRUD with propose-then-approve) land next —
 * for now it's a grounded conversational assistant.
 */

const SYSTEM = `You are the channel-building assistant for a self-hostable service that turns a user's own
Plex media library into curated, always-on live-TV channels (organized into packages). You help the
admin brainstorm, design, and refine channels and packages.

Be concise, concrete, and practical. When proposing a channel, describe what it contains, a sensible
name, and the kind of metadata filters it would use (genre, year, studio, rating, show vs. movie).
Tools to inspect the real library and create channels are being added — for now, help the admin think
it through; do not claim to have made changes you cannot make yet.`.replace(/\n/g, " ");

const firstUserText = (messages: UIMessage[]): string | null => {
  const m = messages.find((x) => x.role === "user");
  const part = m?.parts.find((p) => p.type === "text");
  return part && "text" in part ? (part.text as string) : null;
};

export async function runAgentChat(
  prisma: PrismaClient,
  userId: string,
  opts: { conversationId: string; messages: UIMessage[] },
): Promise<Response> {
  const model = await getActiveModel(prisma);
  if (!model) {
    return new Response(JSON.stringify({ error: "No active AI connection. Add one in Settings → AI Assistant." }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const { conversationId, messages } = opts;

  // Ensure the conversation row exists (client-owned id), then persist the incoming user message.
  await prisma.aiConversation.upsert({
    where: { id: conversationId },
    create: { id: conversationId, userId, title: (firstUserText(messages) ?? "New chat").slice(0, 80) },
    update: {},
  });
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    await prisma.aiMessage.create({
      data: { conversationId, role: "user", parts: last.parts as unknown as Prisma.InputJsonValue },
    });
  }

  const result = streamText({
    model,
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(8),
  });

  return result.toUIMessageStreamResponse({
    onFinish: async ({ responseMessage }) => {
      try {
        await prisma.aiMessage.create({
          data: { conversationId, role: "assistant", parts: responseMessage.parts as unknown as Prisma.InputJsonValue },
        });
        await prisma.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      } catch (e) {
        console.error("Failed to persist assistant message", e);
      }
    },
  });
}
