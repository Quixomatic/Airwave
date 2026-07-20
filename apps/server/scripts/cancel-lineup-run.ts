/**
 * Cancel an in-flight AI lineup run.
 *
 * There is no cancel button on `/workflows/ai-lineup` yet, and a failing step RETRIES — each
 * retry of `planLineup` is a fresh (expensive) call on the planner model. So there needs to
 * be a way to stop a run that's clearly not going to succeed.
 *
 * Run: bun --env-file=.env scripts/cancel-lineup-run.ts [runId]
 * With no argument it cancels every run that isn't already in a terminal state.
 */
import prisma from "@ChannelGuide/db";

async function main() {
  const { getRun } = await import("workflow/api");

  const arg = process.argv[2];
  const runIds: string[] = arg
    ? [arg]
    : (
        await prisma.$queryRawUnsafe<{ id: string }[]>(`
          SELECT id FROM workflow.workflow_runs
          WHERE name LIKE '%aiLineupWorkflow%'
            AND status NOT IN ('completed', 'failed', 'cancelled')
          ORDER BY created_at DESC
        `)
      ).map((r) => r.id);

  if (!runIds.length) {
    console.log("No live runs to cancel.");
    return;
  }

  for (const runId of runIds) {
    try {
      const run = await getRun(runId);
      if (!run) {
        console.log(`${runId}: not found`);
        continue;
      }
      await run.cancel();
      console.log(`${runId}: cancel requested — status now ${await run.status}`);
    } catch (e) {
      console.error(`${runId}: cancel failed —`, e instanceof Error ? e.message : e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
