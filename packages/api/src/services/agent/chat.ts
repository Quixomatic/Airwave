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
 * Sanitize reasoning parts in the model INPUT — drop only the BROKEN ones, keep the valid signed ones.
 *
 * Why not strip all reasoning? Anthropic's extended thinking + tool use requires the signed thinking
 * block to REMAIN on the assistant turn whose tool call is being resumed (our approval flow: the admin
 * approves a write, and the resume request replays that turn). Strip it and Anthropic rejects the
 * request ("expected thinking, found tool_use") — the tool never runs and the card sticks on "Working".
 *
 * But an INTERRUPTED turn persists a `state:"streaming"` reasoning part with no signature, and a
 * client round-trip can drop the signature off a done one. Those unsigned parts trigger the
 * "unsupported reasoning metadata" warning and poison every later request. So the rule is: keep a
 * reasoning part only if it's `done` AND still carries its provider signature; drop the rest. Reasoning
 * stays in the DB + UI for display regardless — this only affects what we feed back to the model.
 */
function stripReasoning(messages: UIMessage[]): UIMessage[] {
  const signed = (p: { providerMetadata?: Record<string, { signature?: string } | undefined> }) =>
    Object.values(p.providerMetadata ?? {}).some((v) => !!v?.signature);
  return messages.map((m) => ({
    ...m,
    parts: m.parts.filter((p) => p.type !== "reasoning" || (p.state === "done" && signed(p as never))),
  }));
}

const isToolPart = (t: string) => t.startsWith("tool-") || t === "dynamic-tool";

/**
 * Heal DANGLING tool calls — a write tool that was proposed/approved but whose turn crashed (or was
 * abandoned) before a result landed. Such a call has no output and no resolvable approval pairing, so
 * `convertToModelMessages` throws `MissingToolResultsError` and the whole conversation is bricked: every
 * later send fails, forever.
 *
 * We inject a synthetic "not applied" result for any resultless tool call that the user has already
 * moved PAST (i.e. a user message exists after that assistant turn) — that turn can never be resumed, so
 * closing it out makes the sequence valid again and the model simply sees the change didn't happen and
 * can re-propose it. A tool call in the FINAL assistant turn (no trailing user message) is left alone —
 * that's a live approval the admin is about to approve/deny, which the SDK resumes normally.
 */
function healDanglingToolCalls(messages: UIMessage[]): UIMessage[] {
  let lastUserIdx = -1;
  messages.forEach((m, i) => {
    if (m.role === "user") lastUserIdx = i;
  });
  return messages.map((m, i) => {
    if (m.role !== "assistant" || i >= lastUserIdx) return m;
    let changed = false;
    const parts = m.parts.map((p) => {
      if (!isToolPart(p.type)) return p;
      const tp = p as { state?: string; output?: unknown; errorText?: string; approval?: unknown };
      const resolved = tp.state === "output-available" || tp.state === "output-error" || tp.output !== undefined || tp.errorText !== undefined;
      if (resolved) return p;
      changed = true;
      const { approval: _approval, ...rest } = tp;
      return { ...rest, state: "output-available", output: { ok: false, note: "Approval was not completed — no change was applied." } };
    });
    return changed ? ({ ...m, parts } as UIMessage) : m;
  });
}

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

  const modelMessages = await convertToModelMessages(stripReasoning(healDanglingToolCalls(messages)));
  // Prompt-cache the whole prefix (system + tools + prior turns). A channel-building chat grows fast —
  // preview_filter alone returns dozens of entries per call — and can hit 100k+ tokens; without caching
  // EVERY turn re-ships all of it uncached to Anthropic, and that per-turn reprocessing latency is what
  // makes a big chat feel "hung" (and occasionally lets a slow turn abort mid-reasoning). A cache
  // breakpoint on the last message caches everything before it; the next turn reuses that prefix and only
  // the new delta is processed fresh. Namespaced to anthropic → a no-op for other providers.
  const lastModelMsg = modelMessages[modelMessages.length - 1] as { providerOptions?: Record<string, unknown> } | undefined;
  if (lastModelMsg) {
    lastModelMsg.providerOptions = { ...(lastModelMsg.providerOptions ?? {}), anthropic: { cacheControl: { type: "ephemeral" } } };
  }

  const result = streamText({
    model,
    system: SYSTEM,
    messages: modelMessages,
    tools: buildAgentTools(prisma, userId),
    // Generous headroom: an exploration/build turn can chain many discovery + preview tool calls.
    // Hitting the cap mid-tool-loop ends the turn with no final text (looks like "no response").
    stopWhen: stepCountIs(40),
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
