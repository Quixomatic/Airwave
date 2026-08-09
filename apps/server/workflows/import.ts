/**
 * The lineup IMPORT workflow (§7.12) — plan → create packages → build channels → report.
 *
 * Recreates packages + channels from an uploaded lineup file (produced by `exportLineup`) on this
 * instance. It's the same durable machinery as the AI lineup workflow (`lineup.ts`) MINUS the AI: no
 * analyze, no planner, no per-channel agent loop. The "plan" here is deterministic (dedupe + number
 * assignment + library remap, all in `services/transfer/import.ts`), and each channel build just creates
 * the channel + its PREDICATE definitions and lays a windowed initial schedule.
 *
 * DRY-RUN: when `args.dryRun` is set the whole thing runs end-to-end for real — validates, resolves each
 * filter against Plex for true pool sizes, writes trace rows so the run page shows live progress — but
 * skips every persisting write. That's how the deployed TrueNAS build gets validated without importing.
 *
 * Durability: `"use workflow"` is the deterministic orchestrator (no I/O); `"use step"` is the actual
 * work (retried, checkpointed). After editing this file you MUST re-run `bunx workflow build`.
 */
import prisma from "@airwave/db";
import { getStepMetadata, getWorkflowMetadata } from "workflow";

import type { ChannelImportResult, ChannelPlan, ImportPlan } from "@airwave/api/services/transfer/import";
import {
  executeChannelPlan,
  executePackagePlan,
  loadResolveSource,
  planImport,
} from "@airwave/api/services/transfer/import";
import type { ImportRunArgs } from "@airwave/api/services/transfer/import-runner";
import { recordImportTrace } from "@airwave/api/services/transfer/import-trace";

/** Schedule generation (~30s/channel) is the slow step, so keep the fan-out modest. */
const BUILD_CONCURRENCY = 4;

/** Identify the run + attempt from INSIDE a step so trace rows join the step timeline. */
function traceContext() {
  const { workflowRunId } = getWorkflowMetadata();
  const { stepId, attempt } = getStepMetadata();
  return { runId: workflowRunId, stepId, attempt };
}

export type ImportReport = {
  dryRun: boolean;
  targetSourceId: string;
  packagesCreated: number;
  packagesReused: number;
  channelsCreated: number;
  channelsSkipped: number;
  channelsDisabled: number;
  channelsFailed: number;
  channelsReassigned: number;
};

export async function importLineupWorkflow(args: ImportRunArgs): Promise<ImportReport> {
  "use workflow";

  // Deterministic plan: dedupe, number assignment, library remap — reads only, no writes.
  const plan = await planStep(args);

  // Packages first (reuse-by-key), so each channel has a real packageId to attach to.
  const packageIds = await createPackagesStep(plan);

  // Fan out only the channels we'll actually create; duplicates were traced in the plan step.
  const jobs = plan.channels.filter((c) => c.action === "create");
  const built: ChannelImportResult[] = [];
  for (let i = 0; i < jobs.length; i += BUILD_CONCURRENCY) {
    const wave = jobs.slice(i, i + BUILD_CONCURRENCY);
    const results = await Promise.all(wave.map((c) => buildChannelStep(c, packageIds, args)));
    built.push(...results);
  }

  return await reportStep(plan, built, args);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** Build the deterministic import plan, and trace each duplicate we'll skip. */
async function planStep(args: ImportRunArgs): Promise<ImportPlan> {
  "use step";
  const plan = await planImport(prisma, args.data, {
    targetSourceId: args.targetSourceId,
    selectedNumbers: args.selectedNumbers,
    dryRun: args.dryRun,
  });

  const ctx = traceContext();
  await recordImportTrace(prisma, {
    ...ctx,
    stepName: "planImport",
    phase: "plan",
    dryRun: plan.dryRun,
    status: "ok",
    output: {
      counts: plan.counts,
      packages: plan.packages.map((p) => ({ key: p.key, action: p.action })),
      numbers: plan.channels
        .filter((c) => c.action === "create")
        .map((c) => ({ name: c.name, from: c.originalNumber, to: c.assignedNumber, reassigned: c.numberReassigned })),
    },
  });

  // Trace the duplicates here (they're not fanned out as build steps).
  for (const c of plan.channels.filter((c) => c.action === "skip-duplicate")) {
    await recordImportTrace(prisma, {
      ...ctx,
      stepName: "planImport",
      phase: "channel",
      dryRun: plan.dryRun,
      channelName: c.name,
      channelNumber: c.originalNumber,
      packageKey: c.packageKey,
      status: "skipped",
      reason: "identical channel already exists",
    });
  }

  console.log(
    `[import] plan${plan.dryRun ? " (DRY RUN)" : ""}: ${plan.counts.toCreate} to create, ` +
      `${plan.counts.skipDuplicate} duplicates, ${plan.counts.disabled} disabled, ${plan.counts.reassigned} renumbered`,
  );
  return plan;
}

/** Create (or reuse) every needed package; returns plan-key → real packageId (null in dry-run creates). */
async function createPackagesStep(plan: ImportPlan): Promise<Record<string, string | null>> {
  "use step";
  const ids: Record<string, string | null> = {};
  let created = 0;
  let reused = 0;
  for (const pkg of plan.packages) {
    const res = await executePackagePlan(prisma, pkg, { dryRun: plan.dryRun });
    ids[res.key] = res.id;
    if (res.action === "reused") reused++;
    else created++;
  }

  await recordImportTrace(prisma, {
    ...traceContext(),
    stepName: "createPackages",
    phase: "packages",
    dryRun: plan.dryRun,
    status: "ok",
    output: { created, reused, packages: plan.packages.map((p) => ({ key: p.key, name: p.name, action: p.action })) },
  });
  console.log(`[import] packages: ${created} created, ${reused} reused`);
  return ids;
}

/** Import one channel — create + windowed schedule (or resolve-only in dry-run) — and trace the outcome. */
async function buildChannelStep(
  plan: ChannelPlan,
  packageIds: Record<string, string | null>,
  args: ImportRunArgs,
): Promise<ChannelImportResult> {
  "use step";
  const source = await loadResolveSource(prisma, args.targetSourceId);
  const packageId = plan.packageKey ? (packageIds[plan.packageKey] ?? null) : null;

  const result = await executeChannelPlan(prisma, plan, {
    packageId,
    targetSourceId: args.targetSourceId,
    userId: args.userId,
    dryRun: args.dryRun ?? false,
    source: source ?? undefined,
  });

  // Trace status: distinguish disabled from created for the page.
  const status: "created" | "skipped" | "disabled" | "failed" =
    result.status === "created" && result.disabled ? "disabled" : result.status;
  await recordImportTrace(prisma, {
    ...traceContext(),
    stepName: "buildChannel",
    phase: "channel",
    dryRun: result.dryRun,
    channelName: result.name,
    channelNumber: result.number,
    packageKey: plan.packageKey,
    status,
    reason: result.reason,
    poolSize: result.poolSize,
    scheduleSlots: result.scheduleSlots,
    numberReassigned: result.numberReassigned,
    output: result,
    error: result.status === "failed" ? result.reason : undefined,
  });

  console.log(
    `[import] ${result.number} ${result.name}: ${status}${result.dryRun ? " (dry-run)" : ""}` +
      (result.poolSize != null ? ` — pool ${result.poolSize}` : "") +
      (result.scheduleSlots != null ? ` + ${result.scheduleSlots} slots` : ""),
  );
  return result;
}

/** Summarize the run. */
async function reportStep(
  plan: ImportPlan,
  built: ChannelImportResult[],
  args: ImportRunArgs,
): Promise<ImportReport> {
  "use step";
  const report: ImportReport = {
    dryRun: args.dryRun ?? false,
    targetSourceId: args.targetSourceId,
    packagesCreated: plan.packages.filter((p) => p.action === "create").length,
    packagesReused: plan.packages.filter((p) => p.action === "reuse").length,
    channelsCreated: built.filter((b) => b.status === "created" && !b.disabled).length,
    channelsSkipped: plan.counts.skipDuplicate,
    channelsDisabled: built.filter((b) => b.status === "created" && b.disabled).length,
    channelsFailed: built.filter((b) => b.status === "failed").length,
    channelsReassigned: built.filter((b) => b.numberReassigned).length,
  };

  await recordImportTrace(prisma, {
    ...traceContext(),
    stepName: "report",
    phase: "report",
    dryRun: report.dryRun,
    status: "ok",
    output: report,
  });
  console.log(`[import] report${report.dryRun ? " (DRY RUN — nothing imported)" : ""}:`, report);
  return report;
}
