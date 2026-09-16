/**
 * Indirection between the tRPC surface and the durable lineup workflow (§7.3a).
 *
 * WHY: the workflow itself must live in `apps/server/workflows/` — the Workflow SDK's
 * CLI scans `./workflows` relative to the app, and the `"use workflow"` directive only
 * gets its build-time transform there. But the procedures that trigger and poll it live
 * here in `packages/api`, which CANNOT import from `apps/server` (that's backwards:
 * apps depend on packages, never the reverse).
 *
 * So the server REGISTERS a runner at startup (`setLineupRunner`) and the router looks
 * it up (`requireLineupRunner`). Dependency direction stays correct, and `packages/api`
 * never has to know the Workflow SDK exists — which also means a build without the WDK
 * env configured still typechecks and boots; the procedures just report "not available".
 */

/**
 * Seed a run from a PREVIOUS run instead of planning fresh (§7.3a Workstreams C+D).
 *  - `apply`   (#32): materialize a completed DRY RUN's verified outcomes into real channels — no AI, no
 *              re-plan. Wipes + recreates the lineup and re-assigns numbers (against real packages), then
 *              creates each would-create channel from the filter the dry run already committed.
 *  - `rebuild` (#23): re-run the AI build for `channelKeys` only, from a completed run's stored plan data,
 *              reusing the existing package + number. No wipe, no re-plan, no renumber; other channels are
 *              left untouched (reported as "skipped over").
 */
export type SeedMode = "apply" | "rebuild";
export type LineupSeed = {
  /** The completed source run to seed from (a dry run for `apply`; any completed run for `rebuild`). */
  fromRunId: string;
  mode: SeedMode;
  /** `rebuild` only: which channel keys to rebuild. Ignored for `apply` (which does the whole lineup). */
  channelKeys?: string[];
};

export type LineupRunArgs = {
  /** Which media source to build the lineup from. */
  sourceId: string;
  /** Admin who triggered the run — recorded as each channel's `createdById`. */
  userId: string;
  /** Seed from a previous run (build-from-dry-run / rebuild-single) instead of planning fresh. */
  seed?: LineupSeed;
  /** Best-quality per-channel agent loop (default) vs the cheap deterministic path. */
  mode?: "quality" | "fast";
  /** Cap the run for testing — build at most this many channels. */
  limit?: number;
  /** Max channel builds in parallel (from AppSettings.channelBuildConcurrency); the workflow falls back to
   *  its own default when absent. */
  concurrency?: number;
  /** Max output tokens for the planner's design call (from AppSettings.plannerMaxOutputTokens). */
  plannerMaxOutputTokens?: number;
  /** DRY RUN (#22): run analyze → plan → per-channel verify for real, but persist NOTHING — no wipe, no
   *  packages, no channels, no schedules. Lets you preview what a lineup WOULD build without touching the
   *  existing one. Mirrors the importer's dry-run. */
  dryRun?: boolean;
};

export type LineupRunStatus = {
  runId: string;
  /** WDK run status — `running` while suspended between steps, too. */
  status: string;
  /** Present once the workflow returns; shape is the §4.5 report. */
  output?: unknown;
};

export type LineupRunner = {
  start(args: LineupRunArgs): Promise<{ runId: string }>;
  status(runId: string): Promise<LineupRunStatus | null>;
  cancel(runId: string): Promise<void>;
};

let runner: LineupRunner | null = null;

/** Called once at server startup, only when the workflow engine is enabled. */
export function setLineupRunner(next: LineupRunner | null) {
  runner = next;
}

/** Null when the workflow engine isn't wired up (env flag off, or a non-server context). */
export function getLineupRunner(): LineupRunner | null {
  return runner;
}

/** Whether the "Build with AI" action should be offered at all. */
export function isLineupRunnerAvailable(): boolean {
  return runner !== null;
}

export function requireLineupRunner(): LineupRunner {
  if (!runner) {
    throw new Error(
      "The lineup workflow engine isn't running. Set WORKFLOW_ENABLED=1 (plus WORKFLOW_TARGET_WORLD / WORKFLOW_POSTGRES_URL) and restart the server.",
    );
  }
  return runner;
}
