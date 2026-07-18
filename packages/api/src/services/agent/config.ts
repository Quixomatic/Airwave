import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { PrismaClient } from "@ChannelGuide/db";
import type { LanguageModel } from "ai";

import { decryptSecret, encryptSecret } from "./crypto";

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

type ConnectionInput = { name: string; provider: string; model: string; baseUrl?: string | null; apiKey?: string };

/** Create a connection. Becomes active if it's the first one. */
export async function createConnection(prisma: PrismaClient, input: ConnectionInput) {
  const count = await prisma.aiConnection.count();
  await prisma.aiConnection.create({
    data: {
      name: input.name,
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl ?? null,
      apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : null,
      isActive: count === 0,
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
