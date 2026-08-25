/**
 * Reading AI lineup runs for the admin observability page.
 *
 * The runs live in the Workflow SDK's own `workflow` schema — which Prisma deliberately
 * cannot see (its describer filters by namespace, which is exactly what keeps `db push`
 * from touching those tables). Raw SQL over the same connection reads them fine, since
 * that restriction is Prisma's model layer, not the database.
 *
 * We read METADATA here only. A run's return value (our `LineupReport`, with the token
 * counts) is stored as CBOR in `output_cbor`, so decoding it means going through the SDK —
 * the page fetches that per-run via `ai.lineupRun`, which calls `getRun().returnValue`.
 */
import type { PrismaClient } from "@airwave/db";

export type LineupRunSummary = {
  runId: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  /** Seconds from start to finish; null while still running. */
  durationSeconds: number | null;
  /** Per-step counts, so the page can show progress without decoding the report. */
  steps: { total: number; completed: number; failed: number; running: number };
};

type RunRow = {
  id: string;
  status: string;
  started_at: Date | null;
  completed_at: Date | null;
  total: number;
  completed: number;
  failed: number;
  running: number;
};

export type LineupRunStep = {
  stepId: string;
  /** Short name, e.g. "buildChannel" — the stored value is a long qualified id. */
  name: string;
  status: string;
  attempt: number;
  startedAt: Date | null;
  completedAt: Date | null;
  durationSeconds: number | null;
  /** Present when the step failed outright (as opposed to returning a skipped result). */
  error: string | null;
};

/**
 * Every step of one run, oldest first — the fan-out breakdown.
 *
 * Metadata only: a step's OUTPUT (the per-channel `ChannelBuildResult`) is CBOR in
 * `output_cbor`, so the channel-level detail — created/skipped/failed, pool size, and the
 * model's reasoning for a skip — is read from the run's report instead, which the page
 * already fetches. The two are correlated in the UI by channel name.
 */
export async function listLineupRunSteps(
  prisma: PrismaClient,
  runId: string,
): Promise<LineupRunStep[]> {
  // Workflows are opt-in (WORKFLOW_ENABLED=1). When off, the `workflow.*` schema is never
  // bootstrapped, so querying it throws Postgres 42P01 (undefined_table) — which is what the
  // observability page hit for users who never enabled the engine. There are no runs: return empty.
  if (process.env.WORKFLOW_ENABLED !== "1") return [];
  const rows = await prisma.$queryRawUnsafe<
    {
      step_id: string;
      step_name: string;
      status: string;
      attempt: number;
      started_at: Date | null;
      completed_at: Date | null;
      error: unknown;
    }[]
  >(
    `SELECT step_id, step_name, status, attempt, started_at, completed_at, error
     FROM workflow.workflow_steps
     WHERE run_id = $1
     ORDER BY created_at ASC`,
    runId,
  );

  return rows.map((r) => ({
    stepId: r.step_id,
    // Stored as "step//./workflows/lineup//buildChannel" — only the tail is useful.
    name: String(r.step_name).split("//").pop() ?? r.step_name,
    status: r.status,
    attempt: Number(r.attempt),
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationSeconds:
      r.started_at && r.completed_at
        ? Math.round((r.completed_at.getTime() - r.started_at.getTime()) / 1000)
        : null,
    error: r.error ? String(JSON.stringify(r.error)).slice(0, 500) : null,
  }));
}

/**
 * Recent AI lineup runs, newest first. Filtered to our workflow by name — the `workflow`
 * schema is shared with any other workflow we add later.
 */
export async function listLineupRuns(
  prisma: PrismaClient,
  limit = 20,
): Promise<LineupRunSummary[]> {
  // See listLineupRunSteps: no `workflow.*` schema when the engine is disabled → return empty.
  if (process.env.WORKFLOW_ENABLED !== "1") return [];
  const rows = await prisma.$queryRawUnsafe<RunRow[]>(
    `
    SELECT r.id,
           r.status,
           r.started_at,
           r.completed_at,
           -- workflow_steps is keyed by (run_id, step_id); it has no id column.
           COUNT(s.step_id)::int                                         AS total,
           COUNT(*) FILTER (WHERE s.status = 'completed')::int           AS completed,
           COUNT(*) FILTER (WHERE s.status = 'failed')::int              AS failed,
           COUNT(*) FILTER (WHERE s.status = 'running')::int             AS running
    FROM workflow.workflow_runs r
    LEFT JOIN workflow.workflow_steps s ON s.run_id = r.id
    WHERE r.name LIKE '%aiLineupWorkflow%'
    GROUP BY r.id, r.status, r.started_at, r.completed_at
    ORDER BY r.created_at DESC
    LIMIT $1
    `,
    limit,
  );

  return rows.map((r) => ({
    runId: r.id,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    durationSeconds:
      r.started_at && r.completed_at
        ? Math.round((r.completed_at.getTime() - r.started_at.getTime()) / 1000)
        : null,
    steps: {
      total: Number(r.total),
      completed: Number(r.completed),
      failed: Number(r.failed),
      running: Number(r.running),
    },
  }));
}
