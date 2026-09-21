/**
 * Indirection between the tRPC surface and the durable PRESET build workflow — same pattern as
 * `agent/lineup-runner.ts` and `transfer/import-runner.ts`. The workflow lives in `apps/server/workflows/`
 * (the WDK CLI scans it there), but the procedures that trigger it live in `packages/api`, which cannot
 * import `apps/server`. So the server registers a runner at startup (`setPresetRunner`) and the dispatch
 * looks it up (`getPresetRunner`) — keeping the dependency direction correct and the app bootable with the
 * engine off (the job fallback runs instead).
 *
 * Unlike the AI-lineup / import runners, the run identity is OUR `PresetRun.id` (created before dispatch and
 * passed in `runId`), so traces + the observability page read one Prisma shape regardless of mode. The WDK's
 * own run id comes back from `start()` and is stored on the row (`workflowRunId`) purely so Stop can cancel
 * the durable run.
 */
import type { PresetSelection } from "./plan";

export type PresetRunArgs = {
  /** The media source to build against. */
  sourceId: string;
  /** Admin who launched it — recorded as each channel's `createdById` where applicable. */
  userId?: string | null;
  /** The staging selection (enabled channel keys); omit → everything (lazy / scheduled). */
  selection?: PresetSelection;
  /** OUR `PresetRun.id` — the run identity threaded through traces + observability (NOT the WDK id). */
  runId: string;
};

export type PresetRunStatus = {
  runId: string;
  status: string;
  output?: unknown;
};

export type PresetRunner = {
  /** Dispatch the workflow; returns the WDK run id (stored as `PresetRun.workflowRunId` for cancel). */
  start(args: PresetRunArgs): Promise<{ workflowRunId: string }>;
  status(workflowRunId: string): Promise<PresetRunStatus | null>;
  cancel(workflowRunId: string): Promise<void>;
};

let runner: PresetRunner | null = null;

/** Called once at server startup, only when the workflow engine is enabled. */
export function setPresetRunner(next: PresetRunner | null) {
  runner = next;
}

export function getPresetRunner(): PresetRunner | null {
  return runner;
}

/** Whether the dedicated preset workflow can run (engine wired up); else the job fallback is used. */
export function isPresetRunnerAvailable(): boolean {
  return runner !== null;
}
