/**
 * Print the recent AI lineup steps and — the point of this — their raw ERRORS.
 *
 * The observability page shows that a step is on attempt 2, but a step's `error` column is
 * where the reason actually lives, and a durable step retries from the top so the terminal
 * may have scrolled the first failure away entirely.
 *
 * Run: bun --env-file=.env scripts/show-lineup-errors.ts
 */
import prisma from "@ChannelGuide/db";

async function main() {
  const rows = await prisma.$queryRawUnsafe<
    {
      run_id: string;
      step_name: string;
      status: string;
      attempt: number;
      error: unknown;
      started_at: Date | null;
      completed_at: Date | null;
    }[]
  >(`
    SELECT s.run_id, s.step_name, s.status, s.attempt, s.error, s.started_at, s.completed_at
    FROM workflow.workflow_steps s
    JOIN workflow.workflow_runs r ON r.id = s.run_id
    WHERE r.name LIKE '%aiLineupWorkflow%'
    ORDER BY s.created_at DESC
    LIMIT 15
  `);

  if (!rows.length) {
    console.log("No lineup steps found.");
    return;
  }

  for (const r of rows) {
    const name = String(r.step_name).split("//").pop();
    const secs =
      r.started_at && r.completed_at
        ? `${Math.round((r.completed_at.getTime() - r.started_at.getTime()) / 1000)}s`
        : "—";
    console.log(`\n=== ${name} · ${r.status} · attempt ${r.attempt} · ${secs} · run ${r.run_id}`);
    if (r.error) console.log(String(JSON.stringify(r.error, null, 2)).slice(0, 2000));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
