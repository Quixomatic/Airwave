/**
 * Boots the durable workflow engine (§7.3a) and registers the lineup runner.
 *
 * THREE pieces have to line up, and missing any one fails in a confusing way:
 *
 *  1. **The world's poller.** `createWorld().start()` runs graphile-worker. WITHOUT IT a
 *     suspended run sits `running` with an open wait FOREVER — hosting the routes is not
 *     enough, because nothing pulls work off the queue.
 *  2. **The three generated handlers**, from `bunx workflow build`. The world dispatches
 *     by POSTing to `${WORKFLOW_LOCAL_BASE_URL}/.well-known/workflow/v1/{flow,step}`.
 *  3. **The client-mode transform** (bunfig.toml preload -> workflow-plugin.ts), which
 *     attaches `workflowId` to the workflow function. Without it `start()` throws
 *     `start-invalid-workflow-function` even though the build succeeded.
 *
 * SECURITY: the handlers execute workflow steps and have NO auth — on Vercel they ride
 * queue-consumer security, which self-hosting doesn't give us. They're machine-to-machine
 * (our own worker calling back over loopback), so there's no user/session to authenticate;
 * better-auth doesn't apply. Instead they live on their OWN listener bound to 127.0.0.1
 * and are never mounted on the public Hono app. Same posture as Postgres on :5433.
 * Revisit if the worker ever runs on another host, or the port is published in Docker.
 */
import { setLineupRunner } from "@ChannelGuide/api/services/agent/lineup-runner";
import { setImportRunner } from "@ChannelGuide/api/services/transfer/import-runner";

import { importLineupWorkflow } from "../workflows/import";
import { aiLineupWorkflow } from "../workflows/lineup";

/**
 * Loopback-only port for the workflow handlers. Never expose this.
 *
 * Read at CALL time, not module scope: imports are evaluated before the importing
 * module's body runs, so a module-level const would capture the default before a caller
 * (e.g. scripts/run-lineup.ts picking a free port) could override it — and then collide
 * with the dev server already holding 3152.
 */
const workflowPort = () => Number(process.env.WORKFLOW_LOCAL_PORT ?? 3152);

export async function startWorkflowEngine(): Promise<void> {
  // Opt-in: the app must boot fine without the engine (and without the generated
  // bundles, which are gitignored and absent on a fresh checkout until `workflow build`).
  if (process.env.WORKFLOW_ENABLED !== "1") {
    console.log("[workflow] disabled (set WORKFLOW_ENABLED=1 to enable)");
    return;
  }

  // Imported lazily so a checkout that hasn't run `bunx workflow build` still boots —
  // the .well-known bundles simply don't exist yet.
  const [{ createWorld }, { start, getRun }, flow, step] = await Promise.all([
    import("@workflow/world-postgres"),
    import("workflow/api"),
    import("../.well-known/workflow/v1/flow.js"),
    import("../.well-known/workflow/v1/step.js"),
  ]);

  Bun.serve({
    hostname: "127.0.0.1", // loopback ONLY — see the security note above
    port: workflowPort(),
    idleTimeout: 255, // a step can be a long LLM call; same reasoning as the main server
    routes: {
      "/.well-known/workflow/v1/flow": { POST: (req: Request) => flow.default.POST(req) },
      "/.well-known/workflow/v1/step": { POST: (req: Request) => step.default.POST(req) },
    },
    fetch: () => new Response("not found", { status: 404 }),
  });

  const world = createWorld();
  await world.start();

  setLineupRunner({
    async start(args) {
      const run = await start(aiLineupWorkflow, [args]);
      console.log(`[workflow] lineup run started: ${run.runId}`);
      return { runId: run.runId };
    },
    async status(runId) {
      const run = await getRun(runId);
      if (!run) return null;
      // `status` and `returnValue` are Promise GETTERS, not plain fields — reading them
      // without awaiting yields "[object Promise]" and every terminal check fails.
      const status = await run.status;
      // Only read the return value once it's actually done; on a live run this would
      // block until the workflow finishes, which would hang a status poll.
      const output = status === "completed" ? await run.returnValue : undefined;
      return { runId, status, output };
    },
    async cancel(runId) {
      const run = await getRun(runId);
      await run?.cancel();
    },
  });

  setImportRunner({
    async start(args) {
      const run = await start(importLineupWorkflow, [args]);
      console.log(`[workflow] import run started: ${run.runId}${args.dryRun ? " (dry-run)" : ""}`);
      return { runId: run.runId };
    },
    async status(runId) {
      const run = await getRun(runId);
      if (!run) return null;
      const status = await run.status;
      const output = status === "completed" ? await run.returnValue : undefined;
      return { runId, status, output };
    },
    async cancel(runId) {
      const run = await getRun(runId);
      await run?.cancel();
    },
  });

  console.log(`[workflow] engine ready (handlers on 127.0.0.1:${workflowPort()}, worker polling)`);
}
