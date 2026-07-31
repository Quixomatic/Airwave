/**
 * Indirection between the tRPC surface and the durable import workflow (§7.12) — same pattern as
 * `agent/lineup-runner.ts`. The workflow lives in `apps/server/workflows/` (the WDK CLI scans it there),
 * but the procedures that trigger + poll it live here in `packages/api`, which CANNOT import `apps/server`.
 * So the server REGISTERS a runner at startup (`setImportRunner`) and the router looks it up
 * (`requireImportRunner`) — keeping the dependency direction correct and the server bootable with the
 * engine off.
 */
import type { ImportedLineup } from "./import";

export type ImportRunArgs = {
  /** The full uploaded lineup file (rides the workflow args, durable). */
  data: ImportedLineup;
  /** Which channel numbers the admin ticked in staging; omit → everything in the file. */
  selectedNumbers?: number[];
  /** The connected + synced source to build against. */
  targetSourceId: string;
  /** Admin who triggered the run — recorded as each channel's `createdById`. */
  userId: string;
  /** Validate + resolve + trace but write NOTHING (validate the deploy / preview for real). */
  dryRun?: boolean;
};

export type ImportRunStatus = {
  runId: string;
  status: string;
  output?: unknown;
};

export type ImportRunner = {
  start(args: ImportRunArgs): Promise<{ runId: string }>;
  status(runId: string): Promise<ImportRunStatus | null>;
  cancel(runId: string): Promise<void>;
};

let runner: ImportRunner | null = null;

/** Called once at server startup, only when the workflow engine is enabled. */
export function setImportRunner(next: ImportRunner | null) {
  runner = next;
}

export function getImportRunner(): ImportRunner | null {
  return runner;
}

/** Whether the "Import" action can actually run (engine wired up). */
export function isImportRunnerAvailable(): boolean {
  return runner !== null;
}

export function requireImportRunner(): ImportRunner {
  if (!runner) {
    throw new Error(
      "The import workflow engine isn't running. Set WORKFLOW_ENABLED=1 and restart the server.",
    );
  }
  return runner;
}
