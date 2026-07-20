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
import type { PrismaClient } from "@ChannelGuide/db";

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

/**
 * Recent AI lineup runs, newest first. Filtered to our workflow by name — the `workflow`
 * schema is shared with any other workflow we add later.
 */
export async function listLineupRuns(
  prisma: PrismaClient,
  limit = 20,
): Promise<LineupRunSummary[]> {
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
