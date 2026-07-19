/**
 * The AI lineup workflow (§7.3a) — analyze → plan → build → report.
 *
 * Replaces the static preset generator's rule-based curation with real understanding:
 * it looks at what's ACTUALLY in the library and decides what channels should exist,
 * instead of evaluating 184 hardcoded presets. Runs autonomously (no per-write approval
 * — that gate lives in the agent-tools WRAPPER, not the services this calls), and every
 * row it creates is stamped `aiGenerated` so a whole run is reversible.
 *
 * Fully implemented: analyze reads the real library, plan is a structured-output call,
 * build runs a grounded per-channel agent that verifies its filter before creating, and
 * every created channel gets a windowed initial schedule so it's watchable immediately.
 *
 * Durability notes (the whole reason this is a workflow and not a Job):
 *  - `"use workflow"` = the deterministic orchestrator. NO side effects here — no I/O,
 *    no Date.now(), no Math.random(). It replays from the event log on resume.
 *  - `"use step"` = the actual work. Auto-retried, result persisted, never re-run once
 *    complete. A crash mid-build resumes only the unfinished channels.
 *  - Step params and return values must be JSON-serializable.
 *
 * After editing this file you MUST re-run `bunx workflow build` — `bun --hot` does not
 * pick up workflow changes (the directives are a build-time transform).
 */
import prisma from "@ChannelGuide/db";

import type { ChannelBuildResult } from "@ChannelGuide/api/services/agent/channel-builder";
import { buildPlannedChannel } from "@ChannelGuide/api/services/agent/channel-builder";
import type { LibraryProfile } from "@ChannelGuide/api/services/agent/library-profile";
import { buildLibraryProfile } from "@ChannelGuide/api/services/agent/library-profile";
import type { LineupPlan, PlannedChannel } from "@ChannelGuide/api/services/agent/lineup-plan";
import { formatLineupPlan, planLineup as planLineupService } from "@ChannelGuide/api/services/agent/lineup-plan";
import type { LineupRunArgs } from "@ChannelGuide/api/services/agent/lineup-runner";
import { clearAiGenerated, createPackage } from "@ChannelGuide/api/services/agent/tools";
import {
  INITIAL_WINDOW_SECONDS,
  generateChannelSchedule,
} from "@ChannelGuide/api/services/schedule/generate";

export type { LibraryProfile, LineupPlan, PlannedChannel, ChannelBuildResult };

/**
 * How many channel builds run at once. Each is an agent loop making several tool calls,
 * so this is really a cap on concurrent LLM conversations — high enough to finish 50
 * channels in reasonable time, low enough to stay under provider rate limits.
 */
const BUILD_CONCURRENCY = 6;

// PlannedChannel / PlannedPackage / LineupPlan now live with the planner service
// (packages/api/.../lineup-plan.ts) so the Zod schema is the single source of truth —
// they're re-exported above.

// ChannelBuildResult lives with the builder service — re-exported above.

export type LineupReport = {
  sourceId: string;
  packagesCreated: number;
  channelsCreated: number;
  skipped: ChannelBuildResult[];
  failed: ChannelBuildResult[];
};

/**
 * Entry point. `start(aiLineupWorkflow, [args])` returns a runId immediately; the run
 * outlives the caller and survives restarts.
 */
export async function aiLineupWorkflow(args: LineupRunArgs): Promise<LineupReport> {
  "use workflow";

  const profile = await analyzeLibrary(args.sourceId);
  const plan = await planLineup(profile, args.limit);

  // Packages first, so each channel has a real packageId to attach to. This also wipes
  // any previous AI lineup — destructive, hence the confirmation on the admin action.
  const packageIds = await createPackages(plan);

  // Flatten so the concurrency cap applies across the WHOLE lineup rather than per
  // package (packages vary from 4 to 7 channels, so per-package batching would idle).
  const jobs = plan.packages.flatMap((pkg) =>
    pkg.channels.map((channel) => ({ channel, packageId: packageIds[pkg.key]! })),
  );

  // Fan out in bounded waves. Each build is its own durable step, so a crash resumes
  // only the unfinished ones. The cap keeps us under the provider's rate limit — every
  // build is an agent loop with several tool calls of its own.
  const built: ChannelBuildResult[] = [];
  for (let i = 0; i < jobs.length; i += BUILD_CONCURRENCY) {
    const wave = jobs.slice(i, i + BUILD_CONCURRENCY);
    const results = await Promise.all(
      wave.map((job) =>
        buildChannel(job.channel, job.packageId, args.sourceId, args.userId, args.mode ?? "quality"),
      ),
    );
    built.push(...results);
  }

  return await reportLineup(args.sourceId, plan, built);
}

// ---------------------------------------------------------------------------
// Steps — each is durable, retried, and checkpointed independently.
// ---------------------------------------------------------------------------

/** §4.1 — distill the library into a few-KB profile the planner can reason over. */
async function analyzeLibrary(sourceId: string): Promise<LibraryProfile> {
  "use step";
  const profile = await buildLibraryProfile(prisma, sourceId);
  console.log(
    `[lineup] analyze: ${profile.totals.movies} movies / ${profile.totals.shows} shows / ` +
      `${profile.totals.episodes} episodes · ${profile.genres.length} genres · ` +
      `${profile.studios.length} studios · ${profile.topShows.length} sizeable shows`,
  );
  return profile;
}

/** §4.2 — one structured-output call over the compact profile. */
async function planLineup(profile: LibraryProfile, limit?: number): Promise<LineupPlan> {
  "use step";
  const plan = await planLineupService(prisma, profile, limit ? { limit } : {});
  const channels = plan.packages.reduce((n, p) => n + p.channels.length, 0);
  console.log(`[lineup] plan: ${plan.packages.length} packages, ${channels} channels\n${formatLineupPlan(plan)}`);
  return plan;
}

/**
 * Wipe any previous AI-built lineup, then create this run's packages (all stamped
 * `aiGenerated`). Returns plan-key -> real packageId for the channel builders.
 *
 * The wipe is scoped to `aiGenerated` rows ONLY — manual channels and the preset
 * generator's `generated` rows are untouched (§5). It's destructive by design: re-runs
 * are wipe-and-rebuild, which is why the admin action must confirm first.
 */
async function createPackages(plan: LineupPlan): Promise<Record<string, string>> {
  "use step";
  const cleared = await clearAiGenerated(prisma, "both");
  if (cleared.channelsDeleted || cleared.packagesDeleted) {
    console.log(`[lineup] cleared previous AI lineup: ${cleared.channelsDeleted} channels, ${cleared.packagesDeleted} packages`);
  }

  const ids: Record<string, string> = {};
  for (const pkg of plan.packages) {
    const created = await createPackage(prisma, {
      name: pkg.name,
      description: pkg.description,
      icon: pkg.icon,
      tint: pkg.accent,
    });
    ids[pkg.key] = created.id;
  }
  console.log(`[lineup] createPackages: ${plan.packages.length} created`);
  return ids;
}

/**
 * §4.4 — ground the filter (discover_field_values + preview_filter), verify the pool
 * matches the theme, create the channel, then give it a WINDOWED initial schedule so
 * it's watchable the moment the run finishes (v0.5.20) rather than waiting on backfill.
 *
 * Each channel is its own durable step, so a crash resumes only the unfinished ones.
 */
async function buildChannel(
  channel: PlannedChannel,
  packageId: string,
  sourceId: string,
  userId: string,
  mode: "quality" | "fast",
): Promise<ChannelBuildResult> {
  "use step";
  const result = await buildPlannedChannel(prisma, {
    channel,
    packageId,
    mediaSourceId: sourceId,
    userId,
    mode,
  });

  if (result.status === "created" && result.channelId) {
    // A full build would lay this channel's ENTIRE pool (potentially ~300 days); the
    // window keeps it to ~12h so 50 channels don't take hours. schedule-refresh grows
    // each one from its stored cursor.
    try {
      const summary = await generateChannelSchedule(prisma, result.channelId, {
        windowSeconds: INITIAL_WINDOW_SECONDS,
      });
      console.log(
        `[lineup] ${channel.number} ${channel.name}: created (pool ${result.poolSize}) + ${summary.itemCount} slots`,
      );
    } catch (err) {
      // The channel is real and correct; only its initial timeline failed. Leave it —
      // schedule-backfill picks up any enabled channel with no schedule.
      console.warn(`[lineup] ${channel.name}: schedule build failed (backfill will retry):`, err);
    }
  } else {
    console.log(`[lineup] ${channel.number} ${channel.name}: ${result.status} — ${result.reason ?? ""}`);
  }

  return result;
}

/** §4.5 — summarize what was built. */
async function reportLineup(
  sourceId: string,
  plan: LineupPlan,
  built: ChannelBuildResult[],
): Promise<LineupReport> {
  "use step";
  const report: LineupReport = {
    sourceId,
    packagesCreated: plan.packages.length,
    channelsCreated: built.filter((b) => b.status === "created").length,
    skipped: built.filter((b) => b.status === "skipped"),
    failed: built.filter((b) => b.status === "failed"),
  };
  console.log(`[lineup] report: ${report.channelsCreated} channels, ${report.skipped.length} skipped`);
  return report;
}
