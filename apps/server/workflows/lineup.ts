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
import {
  buildFilterVocabulary,
  buildLibraryProfile,
  formatFilterVocabulary,
  formatLibraryProfile,
} from "@ChannelGuide/api/services/agent/library-profile";
import type { LineupPlan, PlannedChannel } from "@ChannelGuide/api/services/agent/lineup-plan";
import { formatLineupPlan, planLineup as planLineupService } from "@ChannelGuide/api/services/agent/lineup-plan";
import type { LineupRunArgs } from "@ChannelGuide/api/services/agent/lineup-runner";
import { clearAiGenerated, createPackage, discoverFieldValues } from "@ChannelGuide/api/services/agent/tools";
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
  /** How many channels the planner designed — the full lineup, regardless of any build cap. */
  channelsPlanned: number;
  channelsCreated: number;
  skipped: ChannelBuildResult[];
  failed: ChannelBuildResult[];
  /** What the run cost. Surfaced so spend is visible without waiting for the bill. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Served from the shared prompt cache (~0.1x price) — proof the prefix sharing works. */
    cacheReadTokens: number;
    /** Written to the cache (~1.25x price) — paid once per run, by the first build. */
    cacheWriteTokens: number;
    steps: number;
    channelsWithUsage: number;
  };
};

/**
 * Entry point. `start(aiLineupWorkflow, [args])` returns a runId immediately; the run
 * outlives the caller and survives restarts.
 */
export async function aiLineupWorkflow(args: LineupRunArgs): Promise<LineupReport> {
  "use workflow";

  const profile = await analyzeLibrary(args.sourceId);

  // Built BEFORE the plan now: the planner authors real filters, so it needs the actual tag
  // vocabulary, not just the statistical profile. The same string is then handed to every
  // builder byte-identically, so the whole run shares ONE prompt-cache entry.
  const libraryContext = await buildSharedContext(args.sourceId, profile);

  // The planner always plans the FULL lineup — sized to the library, not to a quota.
  const plan = await planLineup(libraryContext);

  // Packages first, so each channel has a real packageId to attach to. This also wipes
  // any previous AI lineup — destructive, hence the confirmation on the admin action.
  const packageIds = await createPackages(plan);

  // Flatten so the concurrency cap applies across the WHOLE lineup rather than per
  // package (package sizes vary, so per-package batching would idle).
  const allJobs = plan.packages.flatMap((pkg) =>
    pkg.channels.map((channel) => ({ channel, packageId: packageIds[pkg.key]! })),
  );

  // `limit` caps the BUILD fan-out, not the plan. The plan is one call and it's the
  // interesting artifact; the per-channel builds are what cost real money. So a capped run
  // still shows you the whole lineup it would build, and only pays to construct a sample.
  // Interleaved across packages rather than taking the first N, so the sample spans
  // different kinds of channel instead of one package's worth.
  const jobs = args.limit ? sampleAcrossPackages(allJobs, args.limit) : allJobs;
  if (args.limit && allJobs.length > jobs.length) {
    console.log(`[lineup] planned ${allJobs.length} channels; building ${jobs.length} (limit)`);
  }

  // Fan out in bounded waves. Each build is its own durable step, so a crash resumes
  // only the unfinished ones. The cap keeps us under the provider's rate limit — every
  // build is an agent loop with several tool calls of its own.
  const built: ChannelBuildResult[] = [];
  for (let i = 0; i < jobs.length; i += BUILD_CONCURRENCY) {
    const wave = jobs.slice(i, i + BUILD_CONCURRENCY);
    const results = await Promise.all(
      wave.map((job) =>
        buildChannel(
          job.channel,
          job.packageId,
          args.sourceId,
          args.userId,
          libraryContext,
          args.mode ?? "quality",
        ),
      ),
    );
    built.push(...results);
  }

  return await reportLineup(args.sourceId, plan, built);
}

/**
 * Pick `limit` jobs spread ACROSS packages rather than the first N.
 *
 * Taking the head of the list gives you one package's worth of channels, which is a poor
 * sample: the first package is usually the most obvious one (franchises, blockbusters), so
 * a capped run would only ever exercise the easy cases and never the interpretive channels
 * that are the real test. Round-robin gives a cross-section of the lineup instead.
 *
 * Pure function over the flattened list — no I/O — so it's safe in the workflow body.
 */
function sampleAcrossPackages<T extends { packageId: string }>(jobs: T[], limit: number): T[] {
  const byPackage = new Map<string, T[]>();
  for (const j of jobs) {
    const list = byPackage.get(j.packageId);
    if (list) list.push(j);
    else byPackage.set(j.packageId, [j]);
  }
  const queues = [...byPackage.values()];
  const out: T[] = [];
  for (let round = 0; out.length < limit; round++) {
    let placed = false;
    for (const q of queues) {
      if (round >= q.length) continue;
      out.push(q[round]!);
      placed = true;
      if (out.length >= limit) break;
    }
    if (!placed) break; // every queue exhausted
  }
  return out;
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

/**
 * Build the shared cached prefix: the library profile plus the FULL tag vocabulary.
 *
 * Its own step so the Plex round-trips (one per field) are checkpointed and never repeat
 * on a resume. Sent whole, untruncated — it's cached, so size costs almost nothing after
 * the first build, and a complete vocabulary is what stops the agent inventing tag values.
 */
async function buildSharedContext(sourceId: string, profile: LibraryProfile): Promise<string> {
  "use step";
  const vocabulary = await buildFilterVocabulary((field) =>
    discoverFieldValues(prisma, { mediaSourceId: sourceId, mediaTypes: ["movie", "show"], field }),
  );
  const text = [
    formatLibraryProfile(profile),
    "",
    "FILTER VOCABULARY — the exact tag values available. Use ONLY these:",
    formatFilterVocabulary(vocabulary),
  ].join("\n");
  console.log(
    `[lineup] shared context: ${vocabulary.length} fields, ${text.length} chars (~${Math.ceil(text.length / 4)} tokens, cached once for the whole run)`,
  );
  return text;
}

/** §4.2 — one structured-output call over the compact profile. */
async function planLineup(libraryContext: string): Promise<LineupPlan> {
  "use step";
  const plan = await planLineupService(prisma, libraryContext);
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
  libraryContext: string,
  mode: "quality" | "fast",
): Promise<ChannelBuildResult> {
  "use step";
  const result = await buildPlannedChannel(prisma, {
    channel,
    packageId,
    mediaSourceId: sourceId,
    userId,
    libraryContext,
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
  const usage = built.reduce(
    (acc, b) => {
      if (!b.usage) return acc;
      return {
        inputTokens: acc.inputTokens + b.usage.inputTokens,
        outputTokens: acc.outputTokens + b.usage.outputTokens,
        cacheReadTokens: acc.cacheReadTokens + b.usage.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens + b.usage.cacheWriteTokens,
        steps: acc.steps + b.usage.steps,
        channelsWithUsage: acc.channelsWithUsage + 1,
      };
    },
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, steps: 0, channelsWithUsage: 0 },
  );

  const report: LineupReport = {
    sourceId,
    packagesCreated: plan.packages.length,
    // The planner always plans the FULL lineup; a testing cap limits only what gets built.
    // Surfacing both makes that gap explicit instead of looking like a shortfall.
    channelsPlanned: plan.packages.reduce((n, p) => n + p.channels.length, 0),
    channelsCreated: built.filter((b) => b.status === "created").length,
    skipped: built.filter((b) => b.status === "skipped"),
    failed: built.filter((b) => b.status === "failed"),
    usage,
  };
  console.log(
    `[lineup] report: ${report.channelsCreated} created, ${report.skipped.length} skipped, ${report.failed.length} failed · ` +
      `tokens in=${usage.inputTokens.toLocaleString()} (cacheRead ${usage.cacheReadTokens.toLocaleString()}, ` +
      `cacheWrite ${usage.cacheWriteTokens.toLocaleString()}) ` +
      `out=${usage.outputTokens.toLocaleString()} over ${usage.steps} steps in ${usage.channelsWithUsage} builds`,
  );
  return report;
}
