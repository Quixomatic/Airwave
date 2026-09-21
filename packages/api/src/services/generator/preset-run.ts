import type { Prisma, PrismaClient } from "@airwave/db";

import type { PresetChannelOp, PresetSelection } from "./plan";

export type PresetRunMode = "workflow" | "job";
export type PresetRunStatus = "running" | "done" | "failed" | "cancelled";
export type PresetTraceStatus = "pending" | "resolving" | "done" | "failed";

/**
 * The owned run + trace ledger for a preset build. BOTH run modes (the dedicated workflow and the
 * sequential job) write these rows, so the observability page reads one Prisma shape regardless of mode.
 * Every write is best-effort — a trace failure must never take down a build op.
 */

/** Create the run row. Returns its id (the runId threaded through the build). */
export async function startPresetRun(
  prisma: PrismaClient,
  args: { sourceId: string; userId?: string | null; mode: PresetRunMode; selection?: PresetSelection },
): Promise<string> {
  const run = await prisma.presetRun.create({
    data: {
      sourceId: args.sourceId,
      userId: args.userId ?? null,
      mode: args.mode,
      status: "running",
      selection: (args.selection ?? {}) as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  return run.id;
}

/** Open a per-channel trace row (status "resolving"). Best-effort; returns the row id or null. */
export async function startChannelTrace(
  prisma: PrismaClient,
  runId: string,
  op: PresetChannelOp,
): Promise<string | null> {
  try {
    const row = await prisma.presetRunTrace.create({
      data: {
        runId,
        packageKey: op.packageKey,
        packageName: op.packageName,
        channelKey: op.channelKey,
        channelName: op.channelName,
        channelNumber: op.number,
        kind: "channel",
        op: op.kind,
        status: "resolving",
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.warn("[preset-run] trace open failed:", err);
    return null;
  }
}

/** Finalize a per-channel trace row. No-op when the row failed to open. */
export async function updateChannelTrace(
  prisma: PrismaClient,
  traceId: string | null,
  patch: { status: PresetTraceStatus; reason?: string; itemCount?: number },
): Promise<void> {
  if (!traceId) return;
  try {
    await prisma.presetRunTrace.update({
      where: { id: traceId },
      data: {
        status: patch.status,
        reason: patch.reason,
        itemCount: patch.itemCount,
        finishedAt: patch.status === "done" || patch.status === "failed" ? new Date() : undefined,
      },
    });
  } catch (err) {
    console.warn("[preset-run] trace update failed:", err);
  }
}

/** Close the run with its final status + net tallies. Best-effort. */
export async function finishPresetRun(
  prisma: PrismaClient,
  runId: string,
  patch: {
    status: PresetRunStatus;
    created?: number;
    updated?: number;
    deleted?: number;
    skipped?: { name: string; count: number; needed: number }[];
  },
): Promise<void> {
  try {
    await prisma.presetRun.update({
      where: { id: runId },
      data: {
        status: patch.status,
        finishedAt: new Date(),
        created: patch.created,
        updated: patch.updated,
        deleted: patch.deleted,
        skipped: patch.skipped ? (patch.skipped as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (err) {
    console.warn("[preset-run] run finish failed:", err);
  }
}
