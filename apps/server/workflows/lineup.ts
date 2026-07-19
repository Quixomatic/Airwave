/**
 * The AI lineup workflow (§7.3a) — analyze → plan → build → report.
 *
 * Replaces the static preset generator's rule-based curation with real understanding:
 * it looks at what's ACTUALLY in the library and decides what channels should exist,
 * instead of evaluating 184 hardcoded presets. Runs autonomously (no per-write approval
 * — that gate lives in the agent-tools WRAPPER, not the services this calls), and every
 * row it creates is stamped `aiGenerated` so a whole run is reversible.
 *
 * PHASE 1 = SKELETON. The four steps are stubs with the real signatures and
 * checkpoint boundaries in place; Phases 2-4 fill them in.
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

import type { LibraryProfile } from "@ChannelGuide/api/services/agent/library-profile";
import { buildLibraryProfile } from "@ChannelGuide/api/services/agent/library-profile";
import type { LineupRunArgs } from "@ChannelGuide/api/services/agent/lineup-runner";

export type { LibraryProfile };

/** One channel the plan proposes (§4.2). `number` is assigned HERE, not by the builder. */
export type PlannedChannel = {
  key: string;
  name: string;
  number: number;
  description: string;
  /** Plain-language intent the build agent grounds into a real Plex filter. */
  theme: string;
  targetPoolSize: number;
  sortField?: string;
  sortDir?: "asc" | "desc";
  accent?: string;
  icon?: string;
};

export type PlannedPackage = {
  key: string;
  name: string;
  description: string;
  /** Base of this package's hundred-block: 1000, 1100, 1200… (§4.2). */
  numberBase: number;
  tint?: string;
  icon?: string;
  channels: PlannedChannel[];
};

export type LineupPlan = { packages: PlannedPackage[] };

export type ChannelBuildResult = {
  key: string;
  name: string;
  number: number;
  status: "created" | "skipped" | "failed";
  poolSize?: number;
  /** Why it was skipped (0 matches) or failed. */
  reason?: string;
};

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

  // Packages first, so each channel has a real packageId to attach to.
  const packageIds = await createPackages(plan);

  // PHASE 4 will fan this out (~5-10 concurrent, each its own durable step) so a crash
  // resumes only the unfinished channels. Sequential here to keep the skeleton honest.
  const built: ChannelBuildResult[] = [];
  for (const pkg of plan.packages) {
    for (const channel of pkg.channels) {
      built.push(await buildChannel(channel, packageIds[pkg.key]!, args.sourceId, args.mode ?? "quality"));
    }
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

/** §4.2 — one big structured-output call over the profile. PHASE 3. */
async function planLineup(profile: LibraryProfile, limit?: number): Promise<LineupPlan> {
  "use step";
  console.log(`[lineup] plan: ${profile.genres.length} genres, limit=${limit ?? "none"} (stub)`);
  return { packages: [] };
}

/** Create the planned packages, stamped `aiGenerated`. Returns key -> id. PHASE 4. */
async function createPackages(plan: LineupPlan): Promise<Record<string, string>> {
  "use step";
  console.log(`[lineup] createPackages: ${plan.packages.length} (stub)`);
  return {};
}

/**
 * §4.4 — ground the filter (discover_field_values + preview_filter), verify the pool
 * matches the theme, then create the channel and give it a WINDOWED initial schedule so
 * it's watchable immediately (v0.5.20). PHASE 4.
 */
async function buildChannel(
  channel: PlannedChannel,
  packageId: string,
  sourceId: string,
  mode: "quality" | "fast",
): Promise<ChannelBuildResult> {
  "use step";
  console.log(`[lineup] buildChannel: ${channel.number} ${channel.name} [${mode}] pkg=${packageId} src=${sourceId} (stub)`);
  return { key: channel.key, name: channel.name, number: channel.number, status: "skipped", reason: "stub" };
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
