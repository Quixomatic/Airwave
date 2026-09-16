/**
 * Probe: read AI-lineup run data through the SUPPORTED workflow/observability API.
 *
 * `report-run.ts` hand-decodes the world's CBOR columns over raw SQL (cbor-x -> utf8 -> strip the
 * `devl` marker -> devalue.parse). The Workflow SDK ships a first-class version of exactly that: the
 * `world` STORAGE API (`world.runs` / `world.steps`, both with `resolveData: "all"`) plus
 * `hydrateResourceIO` from `workflow/observability`, which deserializes run/step input+output
 * (Dates / Maps / Sets / streams via `observabilityRevivers`) with no raw SQL and no manual
 * marker-stripping. `parseStepName` / `parseWorkflowName` turn the machine names into display bits.
 *
 * The point of this probe is to confirm the supported path works on our self-hosted world-postgres,
 * and that it exposes the three payloads the lifecycle/recovery work depends on:
 *   - run INPUT  = the frozen LineupRunArgs           -> #29 config-drift guard (compare to current)
 *   - planLineup step OUTPUT = the LineupPlanDraft     -> #32 build-from-dry-run (re-seed a new run)
 *   - buildChannel step INPUT = the full PlannedChannel -> #23 rebuild-single (number/accent/filter)
 *
 * READ-ONLY: it never calls `world.start()`, so it does not process the queue or touch any run.
 *
 * Run: bun --env-file=.env scripts/observability-probe.ts [runId]
 *   With no runId it probes the most recent aiLineupWorkflow run.
 */
import { createWorld } from "@workflow/world-postgres";
import {
  hydrateResourceIO,
  observabilityRevivers,
  parseStepName,
  parseWorkflowName,
} from "workflow/observability";

/**
 * The storage API's exact result types aren't re-exported in a convenient shape, and a probe cares
 * about the DECODED payloads, not the row envelope — so access is deliberately loose and defensive.
 * `hydrateResourceIO` returns the same resource with `input` / `output` deserialized in place.
 */
type Loose = Record<string, unknown>;
const hydrate = (r: unknown): Loose => hydrateResourceIO(r as never, observabilityRevivers) as Loose;

/** The SDK stores a workflow's input as the args tuple `[args]`; unwrap a single-element array. */
function unwrapArgs(input: unknown): Loose {
  if (Array.isArray(input)) return (input[0] as Loose) ?? {};
  return (input as Loose) ?? {};
}

function preview(value: unknown, max = 1400): string {
  try {
    const s = JSON.stringify(value, null, 2) ?? String(value);
    return s.length > max ? `${s.slice(0, max)}\n… (${s.length} chars total)` : s;
  } catch {
    return String(value);
  }
}

/** Pick the field that actually carries the value, tolerating camel/snake casing differences. */
function pick<T = unknown>(o: Loose, ...keys: string[]): T | undefined {
  for (const k of keys) if (o[k] != null) return o[k] as T;
  return undefined;
}

/**
 * Drain a paginated `.list({ pagination:{cursor} })` endpoint. The storage API returns ONE page
 * (~20 rows) plus a `cursor`; a full run has more steps than that, so a single call silently drops
 * the earlier phases (analyze/context/plan/…) — follow the cursor to completion.
 */
async function listAll(
  fn: (o: { resolveData?: "all" | "none"; pagination?: { cursor?: string } }) => Promise<{ data: Loose[]; cursor?: string }>,
  resolveData: "all" | "none",
): Promise<Loose[]> {
  const out: Loose[] = [];
  let cursor: string | undefined;
  do {
    const page = await fn({ resolveData, pagination: cursor ? { cursor } : {} });
    out.push(...page.data);
    cursor = page.cursor;
  } while (cursor);
  return out;
}

async function main() {
  const argRun = process.argv[2];
  // Same configless construction the engine uses (workflow-engine.ts) — reads the postgres
  // connection from the environment. Read-only: we never call world.start().
  const world = createWorld() as unknown as {
    runs: {
      list: (o: { resolveData?: "all" | "none"; pagination?: { cursor?: string } }) => Promise<{ data: Loose[]; cursor?: string }>;
      get: (runId: string, o?: { resolveData?: "all" | "none" }) => Promise<Loose>;
    };
    steps: {
      list: (o: { runId: string; resolveData?: "all" | "none"; pagination?: { cursor?: string } }) => Promise<{ data: Loose[]; cursor?: string }>;
    };
  };

  // ── 1. Find the run ──────────────────────────────────────────────────────────────────────────
  let runId = argRun;
  if (!runId) {
    // Metadata only for the scan (cheap), paginated to completion.
    const runs = await listAll((o) => world.runs.list(o), "none");
    const lineup = runs
      .filter((r) => String(pick(r, "name", "workflowName") ?? "").includes("aiLineupWorkflow"))
      .sort((a, b) => {
        const ta = new Date(String(pick(a, "createdAt", "created_at") ?? 0)).getTime();
        const tb = new Date(String(pick(b, "createdAt", "created_at") ?? 0)).getTime();
        return tb - ta;
      });
    runId = lineup[0] ? String(pick(lineup[0], "runId", "id")) : undefined;
    if (!runId) {
      console.log(`No aiLineupWorkflow runs found (scanned ${runs.length} run(s) on the first page).`);
      return;
    }
  }

  // ── 2. Run row + decoded ARGS (#29) ──────────────────────────────────────────────────────────
  const run = hydrate(await world.runs.get(runId, { resolveData: "all" }));
  const wfName = String(pick(run, "name", "workflowName") ?? "");
  console.log(`\n=== RUN ${runId}`);
  console.log(`  workflow: ${wfName}  ${JSON.stringify(safeParse(parseWorkflowName, wfName))}`);
  console.log(`  status:   ${pick(run, "status")}`);

  const args = unwrapArgs(pick(run, "input"));
  console.log(`\n--- ARGS (run INPUT, decoded via workflow/observability) — this is what #29 compares to current config`);
  console.log(preview(args));

  // ── 3. Steps: planLineup OUTPUT (#32) + a buildChannel INPUT (#23) ───────────────────────────
  const rid = runId;
  const rawSteps = await listAll((o) => world.steps.list({ runId: rid, ...o }), "all");
  const steps = rawSteps.map(hydrate);
  console.log(`\n--- STEPS (${steps.length} row(s))`);
  for (const s of steps) {
    const name = String(pick(s, "stepName", "step_name") ?? "");
    const short = safeParse(parseStepName, name);
    console.log(
      `  ${(short?.functionName ?? name).padEnd(22)} ${String(pick(s, "status")).padEnd(10)} ` +
        `attempt ${pick(s, "attempt") ?? 1}  hasInput=${pick(s, "input") != null}  hasOutput=${pick(s, "output") != null}`,
    );
  }

  const isStep = (s: Loose, wanted: string) =>
    String(pick(s, "stepName", "step_name") ?? "").includes(wanted);

  const plan = steps.find((s) => isStep(s, "planLineup"));
  console.log(`\n--- planLineup OUTPUT (the LineupPlanDraft) — this is what #32 re-seeds a run from`);
  if (plan) {
    const draft = pick(plan, "output") as { packages?: { channels?: unknown[] }[] } | undefined;
    const pkgs = draft?.packages?.length ?? 0;
    const chans = draft?.packages?.reduce((n, p) => n + (p.channels?.length ?? 0), 0) ?? 0;
    console.log(`  decoded: ${pkgs} package(s), ${chans} channel(s)`);
    console.log(preview(draft));
  } else {
    console.log("  (no planLineup step on this run — a resumed/partial run may not have reached it)");
  }

  const build = steps.find((s) => isStep(s, "buildChannel"));
  console.log(`\n--- buildChannel INPUT (the full PlannedChannel) — this is what #23 needs to rebuild one`);
  if (build) {
    // The step input is the buildChannel(...) args tuple: [channel, packageId, sourceId, userId, ...].
    const input = pick(build, "input");
    const channel = Array.isArray(input) ? input[0] : input;
    console.log(preview(channel));
  } else {
    console.log("  (no buildChannel step on this run)");
  }

  console.log(`\nOK — the supported workflow/observability + world storage API decoded this run end to end.`);
}

/** parseX helpers throw on unexpected shapes; a probe should degrade to null, not crash. */
function safeParse<T>(fn: (s: string) => T, s: string): T | null {
  try {
    return fn(s);
  } catch {
    return null;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  // The world holds a pg pool open; nothing else keeps the process alive, so exit explicitly.
  .finally(() => process.exit());
