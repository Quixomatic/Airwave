/**
 * Phase 0 spike (§7.3a) — the smallest thing that proves the Workflow SDK works on Bun:
 * a durable workflow with two steps and a `sleep` between them.
 *
 * What it's meant to demonstrate:
 *  - `"use workflow"` / `"use step"` survive `bunx workflow build` under Bun
 *  - graphile-worker + pg + NOTIFY/LISTEN drive the run against OUR Postgres
 *  - the run SUSPENDS across the sleep and RESUMES after the process is killed,
 *    replaying from the event log without re-running completed steps
 *
 * The step logs include a process-start marker so a resumed run visibly executes in a
 * DIFFERENT process than the one that started it — that's the whole claim being tested.
 * Delete this file once Phase 1 lands the real lineup workflow.
 */
import { sleep } from "workflow";

/** Unique per process — proves which process ran a given step. */
const PROC = Math.random().toString(36).slice(2, 8);

export async function spikeWorkflow(label: string) {
  "use workflow";

  const first = await spikeStepOne(label);
  // Suspends the run: no compute is consumed while it waits, and resuming replays
  // from the log rather than re-executing spikeStepOne.
  await sleep("20s");
  const second = await spikeStepTwo(first);

  return { label, first, second };
}

async function spikeStepOne(label: string) {
  "use step";
  const msg = `step-one ran in proc=${PROC} label=${label}`;
  console.log(`[spike] ${msg}`);
  return msg;
}

async function spikeStepTwo(previous: string) {
  "use step";
  const msg = `step-two ran in proc=${PROC} (previous: "${previous}")`;
  console.log(`[spike] ${msg}`);
  return msg;
}
