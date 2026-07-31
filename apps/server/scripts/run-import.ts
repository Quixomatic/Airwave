/**
 * Drive the lineup IMPORT workflow (§7.12) from the CLI — the dev loop, no admin UI needed.
 *
 * Boots the same `startWorkflowEngine()` the server uses (own ports, won't collide with a dev server),
 * exports THIS instance's lineup, then DRY-RUNS importing it back — so it exercises the real path
 * (world poller → loopback handlers → registered import runner → `start(importLineupWorkflow)`) while
 * writing nothing.
 *
 *   bunx workflow build       # ALWAYS re-run after editing workflows/
 *   bun --env-file=.env run scripts/run-import.ts
 *
 * Two dry-runs:
 *   A) the exact export  → every channel should dedupe-skip ("identical") — proves idempotency.
 *   B) a renamed copy    → every channel "would create" with a real pool size + renumbered (its number
 *                          collides with the original it was cloned from) — proves the create/resolve/probe path.
 */
import prisma from "@ChannelGuide/db";

import { exportLineup } from "@ChannelGuide/api/services/transfer/export";
import type { ImportedLineup } from "@ChannelGuide/api/services/transfer/import";
import { requireImportRunner } from "@ChannelGuide/api/services/transfer/import-runner";

import { startWorkflowEngine } from "../src/workflow-engine";

const build = Bun.spawn(["bunx", "workflow", "build"], { stdio: ["ignore", "ignore", "inherit"] });
if ((await build.exited) !== 0) {
  console.error("[run-import] workflow build failed — refusing to run against a stale bundle");
  process.exit(1);
}
console.log("[run-import] handlers rebuilt");

const devPort = process.env.WORKFLOW_DEV_PORT ?? "3155";
process.env.WORKFLOW_ENABLED = "1";
process.env.WORKFLOW_LOCAL_PORT = devPort;
process.env.WORKFLOW_LOCAL_BASE_URL = `http://127.0.0.1:${devPort}`;
await startWorkflowEngine();

const source = await prisma.mediaSource.findFirst({ where: { enabled: true }, select: { id: true, name: true } });
if (!source) throw new Error("No enabled media source found.");
const admin = await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" }, select: { id: true } });
if (!admin) throw new Error("No admin user found.");

const exported = (await exportLineup(prisma)) as unknown as ImportedLineup;
console.log(`[run-import] exported ${exported.packages.length} packages, ${exported.channels.length} channels from "${source.name}"`);

const TERMINAL = new Set(["completed", "failed", "cancelled", "aborted"]);
async function runDry(label: string, data: ImportedLineup) {
  const { runId } = await requireImportRunner().start({ data, targetSourceId: source!.id, userId: admin!.id, dryRun: true });
  console.log(`\n[run-import] ${label}: runId=${runId} — polling…`);
  for (let i = 0; i < 600; i++) {
    await Bun.sleep(1000);
    const status = await requireImportRunner().status(runId);
    if (!status) continue;
    if (TERMINAL.has(status.status)) {
      console.log(`[run-import] ${label}: ${status.status}`);
      console.log(JSON.stringify(status.output ?? {}, null, 2));
      return status.status === "completed";
    }
    if (i % 10 === 0) console.log(`[run-import] ${label}: …${status.status}`);
  }
  console.log(`[run-import] ${label}: gave up waiting`);
  return false;
}

// A) exact export → expect all skipped (duplicates).
const okA = await runDry("A/dedupe", exported);

// B) renamed copy → not duplicates, numbers collide with originals → all renumbered + would-create.
const renamed: ImportedLineup = {
  ...exported,
  channels: exported.channels.map((c) => ({ ...c, name: `${c.name} [test]` })),
};
const okB = await runDry("B/create-path", renamed);

process.exit(okA && okB ? 0 : 1);
