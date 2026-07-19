/**
 * Drive the AI lineup workflow (§7.3a) from the CLI — the dev loop for Phases 2-4,
 * without needing the admin UI or an authenticated tRPC call.
 *
 * Boots the same `startWorkflowEngine()` the server uses, so it exercises the real path:
 * world poller -> loopback handlers -> registered runner -> `start(aiLineupWorkflow)`.
 *
 *   bunx workflow build           # ALWAYS re-run after editing workflows/
 *   bun --env-file=.env run scripts/run-lineup.ts [sourceId] [--limit N] [--fast]
 *
 * Runs on its own ports so it never collides with a dev server you already have up.
 * With no sourceId it picks the first enabled media source.
 */
import prisma from "@ChannelGuide/db";

import { requireLineupRunner } from "@ChannelGuide/api/services/agent/lineup-runner";

import { startWorkflowEngine } from "../src/workflow-engine";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const sourceId =
  args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--limit") ??
  (await prisma.mediaSource.findFirst({ where: { enabled: true }, select: { id: true } }))?.id;

if (!sourceId) throw new Error("No enabled media source found — pass a sourceId explicitly.");

// Force (not ??=) our own port for BOTH the listener and the dispatch base URL: .env
// already sets these for the dev server, and inheriting them would either collide on
// :3152 or send dispatch to the dev server instead of this process.
//
// NB both processes poll the SAME queue, so if a dev server is up it may pick up a step
// first — that's normal queue behaviour, and its output appears in ITS console. The poll
// below still sees the run complete either way.
const devPort = process.env.WORKFLOW_DEV_PORT ?? "3154";
process.env.WORKFLOW_ENABLED = "1";
process.env.WORKFLOW_LOCAL_PORT = devPort;
process.env.WORKFLOW_LOCAL_BASE_URL = `http://127.0.0.1:${devPort}`;

await startWorkflowEngine();

const limit = value("--limit");
const { runId } = await requireLineupRunner().start({
  sourceId,
  mode: flag("--fast") ? "fast" : "quality",
  ...(limit ? { limit: Number(limit) } : {}),
});

console.log(`[run-lineup] runId=${runId} — polling…`);

// Poll until it settles. A long build legitimately sits in `running` while suspended
// between steps, so this only stops on a terminal status.
const TERMINAL = new Set(["completed", "failed", "cancelled", "aborted"]);
for (let i = 0; i < 600; i++) {
  await Bun.sleep(1000);
  const status = await requireLineupRunner().status(runId);
  if (!status) continue;
  if (TERMINAL.has(status.status)) {
    console.log(`[run-lineup] ${status.status}`);
    console.log(JSON.stringify(status.output ?? {}, null, 2));
    process.exit(status.status === "completed" ? 0 : 1);
  }
  if (i % 10 === 0) console.log(`[run-lineup] …${status.status}`);
}

console.log("[run-lineup] gave up waiting (run continues in the background)");
process.exit(0);
