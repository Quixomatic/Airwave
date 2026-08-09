/**
 * Recording what a lineup IMPORT run did (§7.12 observability) — the per-package / per-channel outcome
 * rows the run page reads. Mirrors `agent/lineup-trace.ts` but trimmed: an import has no AI, no token
 * cost, and no hidden agent loop, so this records outcomes (created / skipped / disabled / failed, pool
 * size, reassigned number) rather than reasoning + usage.
 *
 * Recording is best-effort: a trace write that throws must never fail a completed import step.
 */
import type { PrismaClient } from "@airwave/db";

export type ImportTracePhase = "plan" | "packages" | "channel" | "report";

/**
 * Identifies the run/step a call belongs to. Passed IN rather than read here — `getStepMetadata()` lives
 * in the Workflow SDK, which `packages/api` must never import (the inversion that keeps the server
 * bootable with the engine off). The workflow reads the metadata and hands it down.
 */
export type ImportTraceContext = {
  runId: string;
  stepId?: string;
  attempt?: number;
};

export type ImportTraceInput = {
  runId: string;
  stepId?: string | null;
  stepName: string;
  attempt?: number;
  phase: ImportTracePhase;
  dryRun?: boolean;
  packageKey?: string | null;
  channelName?: string | null;
  channelNumber?: number | null;
  status: "ok" | "created" | "skipped" | "disabled" | "failed";
  reason?: string | null;
  poolSize?: number | null;
  scheduleSlots?: number | null;
  numberReassigned?: boolean;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  startedAt?: Date;
};

const MAX_JSON_CHARS = 200_000;

/** JSON-safe + size-capped, so a large payload degrades to a note instead of throwing at insert. */
function toJson(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return undefined;
    if (text.length > MAX_JSON_CHARS) return { truncated: true, chars: text.length, preview: text.slice(0, 2_000) };
    return JSON.parse(text);
  } catch {
    return { unserializable: true };
  }
}

/** Write one trace row. Best-effort: never throws into the caller. */
export async function recordImportTrace(prisma: PrismaClient, t: ImportTraceInput): Promise<void> {
  try {
    await prisma.importTrace.create({
      data: {
        runId: t.runId,
        stepId: t.stepId ?? null,
        stepName: t.stepName,
        attempt: t.attempt ?? 1,
        phase: t.phase,
        dryRun: t.dryRun ?? false,
        packageKey: t.packageKey ?? null,
        channelName: t.channelName ?? null,
        channelNumber: t.channelNumber ?? null,
        status: t.status,
        reason: t.reason ?? null,
        poolSize: t.poolSize ?? null,
        scheduleSlots: t.scheduleSlots ?? null,
        numberReassigned: t.numberReassigned ?? false,
        input: toJson(t.input) as never,
        output: toJson(t.output) as never,
        error: t.error ?? null,
        startedAt: t.startedAt ?? new Date(),
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    console.warn(`[import-trace] failed to record ${t.stepName}/${t.phase}:`, err);
  }
}

/**
 * One trace row as the admin UI sees it. Declared explicitly (JSON columns widened to `unknown`) so
 * inferring it through tRPC doesn't tip the client compiler into TS2589 — same reasoning as
 * `LineupTraceRow`.
 */
export type ImportTraceRow = {
  id: string;
  runId: string;
  stepId: string | null;
  stepName: string;
  attempt: number;
  phase: string;
  dryRun: boolean;
  packageKey: string | null;
  channelName: string | null;
  channelNumber: number | null;
  status: string;
  reason: string | null;
  poolSize: number | null;
  scheduleSlots: number | null;
  numberReassigned: boolean;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

/** Every trace row for an import run, oldest first — the run detail page's data. */
export async function listImportRunTraces(prisma: PrismaClient, runId: string): Promise<ImportTraceRow[]> {
  const rows = await prisma.importTrace.findMany({ where: { runId }, orderBy: { startedAt: "asc" } });
  return rows.map((r) => ({ ...r, input: r.input as unknown, output: r.output as unknown }));
}
