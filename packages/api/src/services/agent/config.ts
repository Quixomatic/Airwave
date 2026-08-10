import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { PrismaClient } from "@airwave/db";
import type { LanguageModel } from "ai";

import { decryptSecret, encryptSecret } from "../crypto";

/**
 * Saved AI provider connections + the provider factory. Several connections can exist; exactly one
 * is active (what the chat uses). `getModel` maps a resolved connection to a Vercel AI SDK model so
 * the rest of the agent is provider-agnostic. "compatible" = any OpenAI-compatible endpoint (Ollama,
 * LM Studio, vLLM, OpenRouter) via a custom baseUrl.
 */

export const AI_PROVIDERS = ["anthropic", "openai", "google", "compatible"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export type ResolvedConnection = { provider: string; model: string; baseUrl: string | null; apiKey: string | null };

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
      return createOpenAI({ apiKey, baseURL: cfg.baseUrl ?? undefined })(cfg.model);
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
  }));
}

/** The active connection resolved WITH its decrypted key — server-internal, for the model factory. */
export async function getActiveConnection(prisma: PrismaClient): Promise<ResolvedConnection | null> {
  const c = await prisma.aiConnection.findFirst({ where: { isActive: true } });
  if (!c) return null;
  return { provider: c.provider, model: c.model, baseUrl: c.baseUrl, apiKey: c.apiKeyEnc ? decryptSecret(c.apiKeyEnc) : null };
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

type ConnectionInput = { name: string; provider: string; model: string; baseUrl?: string | null; apiKey?: string };

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
  await prisma.aiConnection.update({
    where: { id },
    data: { name: input.name, provider: input.provider, model: input.model, baseUrl: input.baseUrl ?? null, ...keyPatch },
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
  };
  try {
    const { generateText } = await import("ai");
    const { text } = await generateText({ model: getModel(resolved), prompt: "Reply with the single word: ok" });
    return { ok: true, sample: text.trim().slice(0, 60) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
  }
}
