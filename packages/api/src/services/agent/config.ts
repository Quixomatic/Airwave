import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { Prisma, type PrismaClient } from "@airwave/db";
import type { LanguageModel } from "ai";

import { decryptSecret, encryptSecret } from "../crypto";

/**
 * Saved AI provider connections + the provider factory. Several connections can exist; exactly one
 * is active (what the chat uses). `getModel` maps a resolved connection to a Vercel AI SDK model so
 * the rest of the agent is provider-agnostic. "compatible" = any OpenAI-compatible endpoint (Ollama,
 * LM Studio, vLLM, OpenRouter) via a custom baseUrl.
 */

export const AI_PROVIDERS = ["anthropic", "openai", "google", "compatible", "zai"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Z.ai (GLM) OpenAI-compatible endpoint — preset so the provider is one-click; overridable per connection. */
export const ZAI_BASE_URL = "https://api.z.ai/api/paas/v4";

export type ResolvedConnection = {
  provider: string;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
  /** LOCAL (`compatible`) only: inject the no-think fields into every request body. */
  disableThinking?: boolean;
  /** LOCAL only: extra JSON merged into every request body (engine-specific escape hatch). */
  extraBody?: unknown;
  /** Z.ai (GLM) only: `reasoning_effort` level ("low" | "high" | "max"); null = provider default. */
  reasoningEffort?: string | null;
};

/**
 * A `fetch` wrapper that merges extra fields into an OpenAI-compatible request body — how we disable a local
 * model's "thinking" without a Modelfile hack or a proxy. Every engine spells it differently and ignores fields
 * it doesn't recognise, so when `disableThinking` is on we send ALL the known variants at once:
 *   - Ollama:        `reasoning_effort: "none"`  (top-level; `think:false` only works on its native API, not /v1)
 *   - vLLM / SGLang: `chat_template_kwargs: { enable_thinking: false }`
 *   - OpenRouter:    `reasoning: { enabled: false }`
 * `extraBody` is merged last so an admin can override or add engine-specific keys. Returns `undefined` when there's
 * nothing to inject (→ the default fetch). Only wired for the `compatible` provider — never for cloud providers.
 */
/**
 * The fetch used for local / OpenAI-compatible model calls. It does two things:
 *
 *  1. **Disables Bun's fetch timeout.** Bun's `fetch` has a default ~300s timeout measured as the time
 *     BETWEEN received chunks (an idle timeout, matched to Chrome). A slow local model (e.g. a 35B
 *     offloaded to CPU/RAM) can spend well over 300s producing NOTHING before the first token — no
 *     chunk arrives, so Bun aborts the request at 300s and the whole step fails and retries. This was
 *     THE cap on the planner, not any platform/SDK limit. `timeout: false` (a Bun-specific RequestInit
 *     extension) removes it so a genuinely slow local call can finish. Harmless for fast calls.
 *  2. **Injects extra body fields** (disable-thinking flags, `extraBody`) when configured.
 *
 * Always returned for the `compatible` provider (unlike before, when it was undefined with no extras),
 * because the timeout removal must apply to every local call regardless of the thinking toggle.
 */
function localFetch(cfg: ResolvedConnection): typeof fetch {
  const extra: Record<string, unknown> = {};
  if (cfg.disableThinking) {
    extra.reasoning_effort = "none";
    extra.chat_template_kwargs = { enable_thinking: false };
    extra.reasoning = { enabled: false };
  }
  // Z.ai (GLM) reasoning depth — GLM-5.3 can't disable thinking, only dial its effort (low/high/max).
  if (cfg.reasoningEffort) extra.reasoning_effort = cfg.reasoningEffort;
  if (cfg.extraBody && typeof cfg.extraBody === "object") Object.assign(extra, cfg.extraBody);
  const hasExtra = Object.keys(extra).length > 0;
  const isZai = cfg.provider === "zai";
  const wrapped = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    let nextInit = init;
    if ((hasExtra || isZai) && init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        Object.assign(body, extra);
        // z.ai (GLM) IGNORES OpenAI's strict `json_schema` response-format and free-forms prose + ```json,
        // which `generateObject` can't parse (known SDK issue vercel/ai#9002). Convert it to `json_object`
        // mode — which z.ai DOES honor, returning clean JSON — and move the schema into a system message so
        // GLM still targets the exact shape; `generateObject` then validates the parsed JSON against Zod.
        const rf = body.response_format as { type?: string; json_schema?: { schema?: unknown } } | undefined;
        if (isZai && rf?.type === "json_schema") {
          const schema = rf.json_schema?.schema;
          body.response_format = { type: "json_object" };
          if (schema && Array.isArray(body.messages)) {
            body.messages = [
              {
                role: "system",
                content:
                  "You MUST respond with ONLY a single JSON object that conforms to this JSON Schema. " +
                  "No prose, no explanation, no markdown code fences.\n\nJSON Schema:\n" +
                  JSON.stringify(schema),
              },
              ...(body.messages as unknown[]),
            ];
          }
        }
        nextInit = { ...init, body: JSON.stringify(body) };
      } catch {
        /* non-JSON body — leave it untouched */
      }
    }
    // `timeout` is a Bun-specific RequestInit field (not in the DOM types) — cast past the type.
    return fetch(input, { ...(nextInit ?? {}), timeout: false } as unknown as RequestInit);
  };
  // Cast past the `preconnect` member the lib's `typeof fetch` declares but the SDK never calls.
  return wrapped as typeof fetch;
}

export function getModel(cfg: ResolvedConnection): LanguageModel {
  const apiKey = cfg.apiKey ?? undefined;
  switch (cfg.provider) {
    case "anthropic":
      return createAnthropic({ apiKey })(cfg.model);
    case "openai":
      return createOpenAI({ apiKey })(cfg.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(cfg.model);
    case "compatible":
      // OpenAI-COMPATIBLE servers (LM Studio, Ollama, vLLM, OpenRouter) implement only the Chat Completions API
      // (`/v1/chat/completions`, `messages`) — NOT OpenAI's newer Responses API (`/v1/responses`, `input`) that the
      // default `createOpenAI(...)(model)` callable now uses. Force `.chat()` so we send `messages`; otherwise these
      // servers reject the request with `Invalid type for 'input'` once tools are attached (GitHub #3). Real OpenAI
      // (the `openai` case above) keeps the default Responses route, which it supports. The optional `fetch` wrapper
      // injects the disable-thinking body fields (local models only).
      //
      // A keyless local endpoint (Ollama, LM Studio) sends no key — but `@ai-sdk/openai` THROWS "OpenAI API key is
      // missing" when it can't load one (even though the endpoint ignores it). Pass a harmless placeholder so a
      // keyless local connection works; a real key (e.g. OpenRouter) is used when provided.
      return createOpenAI({
        apiKey: apiKey ?? "no-key",
        baseURL: cfg.baseUrl ?? undefined,
        fetch: localFetch(cfg),
      }).chat(cfg.model);
    case "zai":
      // Z.ai (GLM) — a first-class CLOUD provider, used like Anthropic/OpenAI (pick a model, paste a key).
      // OpenAI-compatible chat-completions, so `createOpenAI(...).chat()` at the z.ai base URL. `localFetch`
      // adds the timeout safety + the `reasoning_effort` knob.
      //
      // z.ai (GLM) ignores OpenAI's strict `json_schema` response-format AND the dedicated zhipu-ai-provider
      // doesn't inject the schema for GLM reasoning models (it warns "responseFormat not supported" and GLM
      // then invents its own shape). So `localFetch` does the right thing: rewrites json_schema → json_object
      // (which z.ai honors) and moves the schema into a system message so GLM targets the exact shape;
      // `generateObject` validates the parsed JSON against Zod. Same createOpenAI path as `compatible`.
      return createOpenAI({
        apiKey: apiKey ?? "no-key",
        baseURL: cfg.baseUrl ?? ZAI_BASE_URL,
        fetch: localFetch(cfg),
      }).chat(cfg.model);
    default:
      throw new Error(`Unknown AI provider: ${cfg.provider}`);
  }
}

/** Public view of one connection — never exposes the key, just whether one is set. */
type PublicConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  hasKey: boolean;
  isActive: boolean;
  isPlanner: boolean;
  isWorker: boolean;
  disableThinking: boolean;
  extraBody: unknown;
  reasoningEffort: string | null;
};

/** All saved connections (active first, then newest). */
export async function listConnections(prisma: PrismaClient): Promise<PublicConnection[]> {
  const rows = await prisma.aiConnection.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    provider: c.provider,
    model: c.model,
    baseUrl: c.baseUrl,
    hasKey: !!c.apiKeyEnc,
    isActive: c.isActive,
    isPlanner: c.isPlanner,
    isWorker: c.isWorker,
    disableThinking: c.disableThinking,
    extraBody: c.extraBody,
    reasoningEffort: c.reasoningEffort,
  }));
}

/** The active connection resolved WITH its decrypted key — server-internal, for the model factory. */
export async function getActiveConnection(prisma: PrismaClient): Promise<ResolvedConnection | null> {
  const c = await prisma.aiConnection.findFirst({ where: { isActive: true } });
  if (!c) return null;
  return {
    provider: c.provider,
    model: c.model,
    baseUrl: c.baseUrl,
    apiKey: c.apiKeyEnc ? decryptSecret(c.apiKeyEnc) : null,
    disableThinking: c.disableThinking,
    extraBody: c.extraBody,
    reasoningEffort: c.reasoningEffort,
  };
}

export async function getActiveModel(prisma: PrismaClient): Promise<LanguageModel | null> {
  const c = await getActiveConnection(prisma);
  return c ? getModel(c) : null;
}

/**
 * Connection ROLES. `active` is the admin chat; the other two let the lineup workflow point its two
 * very different workloads at different models:
 *  - `planner` — ONE big reasoning call producing the whole lineup. Quality matters most.
 *  - `worker`  — ~50 mechanical per-channel build loops. Volume dominates the bill, so a cheap
 *                model here is the single biggest cost lever in the run.
 *
 * A single connection auto-claims all three roles on creation, so a one-connection setup needs no
 * configuration. Roles are EXPLICIT (no runtime fallback): the UI's "Same as chat" copies the chat
 * connection onto the planner/worker flag, and clearing a role turns it off — so a missing planner or
 * worker genuinely means the AI lineup is unavailable.
 */
export const CONNECTION_ROLES = ["active", "planner", "worker"] as const;
export type ConnectionRole = (typeof CONNECTION_ROLES)[number];

const ROLE_FIELD: Record<ConnectionRole, "isActive" | "isPlanner" | "isWorker"> = {
  active: "isActive",
  planner: "isPlanner",
  worker: "isWorker",
};

/** Resolve a role to the connection that explicitly holds it (no fallback — a cleared role is off). */
export async function getConnectionForRole(
  prisma: PrismaClient,
  role: ConnectionRole,
): Promise<ResolvedConnection | null> {
  const c = await prisma.aiConnection.findFirst({ where: { [ROLE_FIELD[role]]: true } });
  if (!c) return null;
  return {
    provider: c.provider,
    model: c.model,
    baseUrl: c.baseUrl,
    apiKey: c.apiKeyEnc ? decryptSecret(c.apiKeyEnc) : null,
    disableThinking: c.disableThinking,
    extraBody: c.extraBody,
    reasoningEffort: c.reasoningEffort,
  };
}

/**
 * Assign a role to a connection, clearing it from whichever connection held it.
 * `active` can't be cleared outright — the chat always needs a target.
 */
export async function setConnectionRole(
  prisma: PrismaClient,
  id: string,
  role: ConnectionRole,
  enabled = true,
) {
  const field = ROLE_FIELD[role];
  // Any role — including chat — may be cleared. Clearing chat turns the assistant off; the AI lineup
  // then becomes unavailable too once nothing resolves for planner/worker (they fall back to chat).
  await prisma.$transaction([
    // Exclusive: only one connection holds a given role at a time.
    prisma.aiConnection.updateMany({ where: { [field]: true }, data: { [field]: false } }),
    ...(enabled
      ? [prisma.aiConnection.update({ where: { id }, data: { [field]: true } })]
      : []),
  ]);
  return listConnections(prisma);
}

type ConnectionInput = {
  name: string;
  provider: string;
  model: string;
  baseUrl?: string | null;
  apiKey?: string;
  /** LOCAL (`compatible`) only — inject the no-think body fields. */
  disableThinking?: boolean;
  /** LOCAL only — extra JSON merged into every request body. `null` clears it. */
  extraBody?: unknown;
  /** Z.ai (GLM) only — `reasoning_effort` level; `null` clears it (back to provider default). */
  reasoningEffort?: string | null;
};

/**
 * Create a connection. The FIRST connection claims every role, so a single-connection setup needs
 * no configuration at all — it's chat, planner and worker. Later connections start with no roles;
 * the admin assigns them explicitly, which is the whole point of having more than one.
 */
export async function createConnection(prisma: PrismaClient, input: ConnectionInput) {
  const first = (await prisma.aiConnection.count()) === 0;
  await prisma.aiConnection.create({
    data: {
      name: input.name,
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl ?? null,
      apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : null,
      disableThinking: input.disableThinking ?? false,
      ...(input.extraBody != null ? { extraBody: input.extraBody as Prisma.InputJsonValue } : {}),
      reasoningEffort: input.reasoningEffort ?? null,
      isActive: first,
      isPlanner: first,
      isWorker: first,
    },
  });
  return listConnections(prisma);
}

/** Update a connection. `apiKey`: undefined = leave unchanged, "" = clear, string = set. */
export async function updateConnection(prisma: PrismaClient, id: string, input: ConnectionInput) {
  const keyPatch = input.apiKey === undefined ? {} : { apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : null };
  // Json field: undefined = leave unchanged, null = clear (DbNull), object = set.
  const extraBodyPatch =
    input.extraBody === undefined
      ? {}
      : { extraBody: input.extraBody === null ? Prisma.DbNull : (input.extraBody as Prisma.InputJsonValue) };
  await prisma.aiConnection.update({
    where: { id },
    data: {
      name: input.name,
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl ?? null,
      disableThinking: input.disableThinking ?? false,
      reasoningEffort: input.reasoningEffort ?? null,
      ...keyPatch,
      ...extraBodyPatch,
    },
  });
  return listConnections(prisma);
}

export async function deleteConnection(prisma: PrismaClient, id: string) {
  const wasActive = (await prisma.aiConnection.findUnique({ where: { id }, select: { isActive: true } }))?.isActive;
  await prisma.aiConnection.delete({ where: { id } });
  // If we removed the active one, promote the newest remaining so the chat always has a target.
  if (wasActive) {
    const next = await prisma.aiConnection.findFirst({ orderBy: { createdAt: "desc" } });
    if (next) await prisma.aiConnection.update({ where: { id: next.id }, data: { isActive: true } });
  }
  return listConnections(prisma);
}

/** Make one connection active (unsets the others). */
export async function setActiveConnection(prisma: PrismaClient, id: string) {
  await prisma.$transaction([
    prisma.aiConnection.updateMany({ where: { isActive: true, id: { not: id } }, data: { isActive: false } }),
    prisma.aiConnection.update({ where: { id }, data: { isActive: true } }),
  ]);
  return listConnections(prisma);
}

/** A cheap round-trip to verify a specific connection's provider/model/key work. */
export async function testConnection(prisma: PrismaClient, id: string): Promise<{ ok: boolean; sample?: string; error?: string }> {
  const c = await prisma.aiConnection.findUnique({ where: { id } });
  if (!c) return { ok: false, error: "Connection not found" };
  const resolved: ResolvedConnection = {
    provider: c.provider,
    model: c.model,
    baseUrl: c.baseUrl,
    apiKey: c.apiKeyEnc ? decryptSecret(c.apiKeyEnc) : null,
    disableThinking: c.disableThinking,
    extraBody: c.extraBody,
    reasoningEffort: c.reasoningEffort,
  };
  try {
    const { generateText } = await import("ai");
    const { text } = await generateText({ model: getModel(resolved), prompt: "Reply with the single word: ok" });
    return { ok: true, sample: text.trim().slice(0, 60) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}
