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

export type LineupRunArgs = {
  /** Which media source to build the lineup from. */
  sourceId: string;
  /** Admin who triggered the run — recorded as each channel's `createdById`. */
  userId: string;
  /** Best-quality per-channel agent loop (default) vs the cheap deterministic path. */
  mode?: "quality" | "fast";
  /** Cap the run for testing — build at most this many channels. */
  limit?: number;
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
