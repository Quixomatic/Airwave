/**
 * The dedicated PRESET build workflow — the non-AI, human-in-the-loop channel generator run under the
 * durable engine. Same machinery as the import workflow (`import.ts`) minus the AI: a deterministic prepare
 * (upsert packages + diff plan) then a bounded fan-out of per-channel ops (create / update / delete), each a
 * retryable `"use step"` that materializes one channel and records a trace row.
 *
 * The run identity is OUR `PresetRun.id` (passed in `args.runId`), so both this workflow and the job
 * fallback write the same `PresetRunTrace` rows and the observability page reads one Prisma shape regardless
 * of mode. `PresetRun` itself is created by the dispatch (`preset.build`) before this runs, and closed here
 * in `finalizeStep`.
 *
 * Durability: `"use workflow"` is the deterministic orchestrator (no I/O); `"use step"` does the work
 * (retried, checkpointed). After editing this file you MUST re-run `bunx workflow build`.
 */
import prisma from "@airwave/db";

import {
  loadPresetSource,
  materializePresetChannel,
  removePresetChannel,
  upsertPresetPackages,
} from "@airwave/api/services/generator/generate";
import { type PresetChannelOp, planPresetBuild } from "@airwave/api/services/generator/plan";
import { finishPresetRun, startChannelTrace, updateChannelTrace } from "@airwave/api/services/generator/preset-run";
import type { PresetRunArgs } from "@airwave/api/services/generator/preset-runner";
import { getAppSettings } from "@airwave/api/services/settings/index";

/** Fallback fan-out width when AppSettings hasn't set one (matches the AI lineup default). */
const DEFAULT_CONCURRENCY = 6;

type OpResult = {
  status: "created" | "updated" | "deleted" | "skipped" | "failed";
  skip?: { name: string; count: number; needed: number };
};

export type PresetReport = {
  runId: string;
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
};

export async function presetWorkflow(args: PresetRunArgs): Promise<PresetReport> {
  "use workflow";

  const { ops, concurrency } = await prepareStep(args);

  // Bounded fan-out over the diff ops (numbers were reserved in the plan, so parallel creates don't collide;
  // materialize is idempotent on the unique number for re-delivery).
  const results: OpResult[] = [];
  for (let i = 0; i < ops.length; i += concurrency) {
    const wave = ops.slice(i, i + concurrency);
    results.push(...(await Promise.all(wave.map((op) => applyOpStep(op, args)))));
  }

  return await finalizeStep(args, results);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** Upsert packages + compute the diff plan (reads + reserves numbers, no channel writes). */
async function prepareStep(args: PresetRunArgs): Promise<{ ops: PresetChannelOp[]; concurrency: number }> {
  "use step";
  await upsertPresetPackages(prisma, "all");
  const plan = await planPresetBuild(prisma, args.sourceId, { selection: args.selection });
  const settings = await getAppSettings(prisma);
  const concurrency = settings.channelBuildConcurrency ?? DEFAULT_CONCURRENCY;
  // Deletes first (free numbers), then creates + updates.
  const ops = [...plan.delete, ...plan.create, ...plan.update];
  console.log(
    `[preset] plan: ${plan.create.length} create, ${plan.update.length} update, ` +
      `${plan.delete.length} delete, ${plan.unchanged.length} unchanged`,
  );
  return { ops, concurrency };
}

/** Apply one diff op (create / update / delete) and trace the outcome. */
async function applyOpStep(op: PresetChannelOp, args: PresetRunArgs): Promise<OpResult> {
  "use step";
  const traceId = await startChannelTrace(prisma, args.runId, op);
  try {
    if (op.kind === "delete") {
      await removePresetChannel(prisma, op.channelId!);
      await updateChannelTrace(prisma, traceId, { status: "done" });
      return { status: "deleted" };
    }

    const src = await loadPresetSource(prisma, args.sourceId);
    const r = await materializePresetChannel(prisma, src, op);
    if (r.status === "skipped") {
      await updateChannelTrace(prisma, traceId, {
        status: "done",
        reason: `only ${r.itemCount} of ${r.needed} needed`,
        itemCount: r.itemCount,
      });
      return { status: "skipped", skip: { name: op.channelName, count: r.itemCount, needed: r.needed } };
    }
    await updateChannelTrace(prisma, traceId, { status: "done", itemCount: r.itemCount });
    return { status: r.status };
  } catch (err) {
    console.warn(`[preset] op failed for "${op.channelName}":`, err);
    await updateChannelTrace(prisma, traceId, {
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    });
    return { status: "failed" };
  }
}

/** Drop emptied packages, close the run, and summarize. */
async function finalizeStep(args: PresetRunArgs, results: OpResult[]): Promise<PresetReport> {
  "use step";
  await prisma.channelPackage.deleteMany({ where: { generated: true, channels: { none: {} } } });

  const created = results.filter((r) => r.status === "created").length;
  const updated = results.filter((r) => r.status === "updated").length;
  const deleted = results.filter((r) => r.status === "deleted").length;
  const skippedList = results.map((r) => r.skip).filter((s): s is NonNullable<typeof s> => !!s);

  await finishPresetRun(prisma, args.runId, { status: "done", created, updated, deleted, skipped: skippedList });

  const report: PresetReport = { runId: args.runId, created, updated, deleted, skipped: skippedList.length };
  console.log("[preset] report:", report);
  return report;
}
