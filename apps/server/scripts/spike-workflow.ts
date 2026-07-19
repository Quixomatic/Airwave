/**
 * Phase 0 spike runner (§7.3a) — proves the Vercel Workflow SDK works on Bun against
 * OUR Postgres, and that a run genuinely survives the process dying.
 *
 * Prereq (once):  bunx --package @workflow/world-postgres bootstrap
 * Build (each time workflows/ changes):  bunx workflow build
 *
 *   # 1. start a run, then KILL this process (Ctrl+C) while it's in the 20s sleep
 *   bun --env-file=.env run scripts/spike-workflow.ts start
 *
 *   # 2. bring a NEW process up — the run should resume and finish here
 *   bun --env-file=.env run scripts/spike-workflow.ts serve
 *
 *   # 3. inspect any run
 *   bun --env-file=.env run scripts/spike-workflow.ts status <runId>
 *
 * The step logs print a per-process id, so a resumed run visibly executes its second
 * step in a DIFFERENT process than the one that ran the first — which is the whole
 * durability claim. `serve` hosts the three generated handler routes; without a live
 * process holding them, graphile-worker has nothing to deliver work to.
 */
import flow from "../.well-known/workflow/v1/flow.js";
import step from "../.well-known/workflow/v1/step.js";
import { createWorld } from "@workflow/world-postgres";
import { getRun, start } from "workflow/api";

import { spikeWorkflow } from "../workflows/spike";

const PORT = Number(process.env.WORKFLOW_SPIKE_PORT ?? 3152);

/**
 * Host the SDK's generated endpoints. These take Web-standard `Request`s, so mounting
 * them on our real Hono app later is `app.post(path, (c) => flow.POST(c.req.raw))`.
 * NOTE: self-hosted these have NO built-in auth (on Vercel they ride queue-consumer
 * security) — the real integration must gate them with a shared secret.
 */
function serve() {
  const server = Bun.serve({
    port: PORT,
    idleTimeout: 255,
    routes: {
      "/.well-known/workflow/v1/flow": { POST: (req: Request) => flow.POST(req) },
      "/.well-known/workflow/v1/step": { POST: (req: Request) => step.POST(req) },
    },
    fetch: () => new Response("spike", { status: 200 }),
  });
  console.log(`[spike] handlers listening on :${server.port}`);
  return server;
}

const cmd = process.argv[2] ?? "serve";

if (cmd === "status") {
  const runId = process.argv[3];
  if (!runId) throw new Error("usage: spike-workflow.ts status <runId>");
  const run = await getRun(runId);
  console.log(JSON.stringify({ runId, status: run?.status }, null, 2));
  process.exit(0);
}

serve();

// Start the Postgres World's graphile-worker poller. WITHOUT THIS a process only hosts
// the HTTP handlers and nothing ever pulls work off the queue — a suspended run stays
// `running` forever with an open wait. This is the line that goes next to startJobs()
// in apps/server/src/index.ts.
const world = createWorld();
await world.start();
console.log("[spike] postgres world started (graphile-worker polling)");

if (cmd === "start") {
  const run = await start(spikeWorkflow, [`spike-${new Date().toISOString()}`]);
  console.log(`[spike] started runId=${run.runId}`);
  console.log("[spike] now KILL this process during the 20s sleep, then run `serve`.");
}

// Keep the process alive so graphile-worker can deliver work to the handlers.
setInterval(() => {}, 1 << 30);
