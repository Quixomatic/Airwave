/**
 * Reading lineup IMPORT runs for the observability page — the runs live in the Workflow SDK's own
 * `workflow` schema (which Prisma deliberately can't see), so this reads them via raw SQL over the same
 * connection, filtered to our import workflow by name. Mirrors `agent/lineup-runs.ts`.
 */
import type { PrismaClient } from "@airwave/db";

export type ImportRunSummary = {
  runId: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  durationSeconds: number | null;
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

export type ImportRunStep = {
  stepId: string;
  name: string;
  status: string;
  attempt: number;
  startedAt: Date | null;
  completedAt: Date | null;
  durationSeconds: number | null;
  error: string | null;
};

/** Every step of one import run, oldest first — the fan-out breakdown (metadata only). */
export async function listImportRunSteps(prisma: PrismaClient, runId: string): Promise<ImportRunStep[]> {
  // Workflows are opt-in (WORKFLOW_ENABLED=1). When off, the `workflow.*` schema is never bootstrapped,
  // so querying it throws Postgres 42P01 (undefined_table). There are no runs: return empty.
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

/** Recent import runs, newest first — filtered to our workflow by name. */
export async function listImportRuns(prisma: PrismaClient, limit = 20): Promise<ImportRunSummary[]> {
  // See listImportRunSteps: no `workflow.*` schema when the engine is disabled → return empty.
  if (process.env.WORKFLOW_ENABLED !== "1") return [];
  const rows = await prisma.$queryRawUnsafe<RunRow[]>(
    `
    SELECT r.id,
           r.status,
           r.started_at,
           r.completed_at,
           COUNT(s.step_id)::int                                         AS total,
           COUNT(*) FILTER (WHERE s.status = 'completed')::int           AS completed,
           COUNT(*) FILTER (WHERE s.status = 'failed')::int              AS failed,
           COUNT(*) FILTER (WHERE s.status = 'running')::int             AS running
    FROM workflow.workflow_runs r
    LEFT JOIN workflow.workflow_steps s ON s.run_id = r.id
    WHERE r.name LIKE '%importLineupWorkflow%'
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
