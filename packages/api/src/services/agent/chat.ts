import { Prisma, type PrismaClient } from "@ChannelGuide/db";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

import { buildAgentTools } from "./agent-tools";
import { getActiveModel } from "./config";

/**
 * The channel-building chat. Runs the active AI connection through the Vercel AI SDK and streams a
 * UI-message response back, persisting the exchange to the conversation (client owns the id). Tools
 * (library discovery, resolver preview, channel/package CRUD with propose-then-approve) land next —
 * for now it's a grounded conversational assistant.
 */

const SYSTEM = `You are the channel-building assistant for a self-hostable service that turns a user's own
Plex media library into curated, always-on live-TV channels (organized into packages).

You have TOOLS to inspect the real library and build channels/packages. Work is GROUNDED and SAFE:
- Start by calling list_media_sources to get the mediaSourceId.
- Build filters ONLY from real data: use list_filter_fields for the allowed fields/operators and
  discover_field_values for the real values of a tag field (e.g. genre, studio). Never invent a
  genre or studio — discover it. Use search_titles to check whether specific titles exist.
- ALWAYS test a filter with preview_filter (count + sample) BEFORE creating a channel, and report the
  count. If a filter returns 0 or looks wrong, refine it — don't create it.
- Filters are a tree of conditions (field, op, value as a string) combined by and/or groups. TV/show
  filtering uses show-scoped fields; check appliesTo.
- IMPORTANT — Plex operator semantics: on the "title" field the "is" operator is a SUBSTRING (contains)
  match, NOT exact: title is "Bear" matches ANY title containing "Bear". So to include a show, use a
  short distinctive substring (e.g. "Bluey", "Sesame") — but beware over-matching (e.g. "Bear" would also
  match "Berenstain Bears"), and verify with preview_filter before creating.
- Writes (create/update/delete channel or package) require the admin's approval — propose them and
  they'll be confirmed. To change one thing (a number, a package, enabled), use update_channel with
  just that field.
Be concise and concrete. Explain what you're building and why, backed by the preview counts.`.replace(/\n/g, " ");

const firstUserText = (messages: UIMessage[]): string | null => {
  const m = messages.find((x) => x.role === "user");
  const part = m?.parts.find((p) => p.type === "text");
  return part && "text" in part ? (part.text as string) : null;
};

/**
 * Persist the WHOLE conversation, upserting each message by its own id. Idempotent, so it's safe to
 * call both before streaming (saves the user turn immediately) and on finish (captures the full
 * multi-step assistant turn — tool calls and all). Keyed on the message's own id (not a fresh cuid)
 * so the reloaded ids round-trip and never duplicate.
 */
async function persistConversation(prisma: PrismaClient, conversationId: string, userId: string, messages: UIMessage[]) {
  await prisma.aiConversation.upsert({
    where: { id: conversationId },
    create: { id: conversationId, userId, title: (firstUserText(messages) ?? "New chat").slice(0, 80) },
    update: { updatedAt: new Date() },
  });
  const base = Date.now();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    const parts = m.parts as unknown as Prisma.InputJsonValue;
    await prisma.aiMessage.upsert({
      where: { id: m.id },
      create: { id: m.id, conversationId, role: m.role, parts, createdAt: new Date(base + i) },
      update: { role: m.role, parts },
    });
  }
}

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
  // Save the incoming turn up front (safety net if the stream never finishes).
  await persistConversation(prisma, conversationId, userId, messages).catch((e) => console.error("chat persist (pre)", e));

  const result = streamText({
    model,
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    tools: buildAgentTools(prisma, userId),
    stopWhen: stepCountIs(16),
    onError: ({ error }) => console.error("chat streamText error", error),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // `messages` here is the FULL updated list (original + the new assistant turn with tool parts).
    onFinish: ({ messages: finalMessages }) => {
      void persistConversation(prisma, conversationId, userId, finalMessages).catch((e) => console.error("chat persist (finish)", e));
    },
  });
}
