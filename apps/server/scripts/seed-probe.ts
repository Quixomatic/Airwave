/**
 * Inspector: assemble the SEED a build-from-dry-run (#32) / rebuild-single (#23) run would consume from a
 * previous run. A permanent tool — tweak it whenever you need to see what run/step data the observability
 * API can hand back (draft, per-channel input/output, committed filters, etc.).
 *
 * A seeded run doesn't re-plan or (for apply) re-run the AI: it reuses the source run's already-computed
 * data. This checks that data is all readable and complete:
 *   - the plan DRAFT (planLineup step output) — packages + per-channel plan data (theme, proposed filter)
 *   - per channel: the full PlannedChannel + packageId + number (buildChannel step INPUT)
 *   - per channel: the COMMITTED filter + status + pool size (buildChannel step OUTPUT — `committedFilter`
 *     is only present on runs built after that capture landed, so old runs will show it missing)
 *
 * apply (#32) consumes: draft + each channel's committedFilter/mediaTypes/status (materialize, no AI; numbers
 *   are re-assigned against real packages, so the dry-run numbers aren't reused).
 * rebuild (#23) consumes: the target channel's PlannedChannel + its real packageId + number (re-run the AI).
 *
 * READ-ONLY. Run: bun --env-file=.env scripts/seed-probe.ts [runId]  (defaults to the latest lineup run)
 */
import prisma from "@airwave/db";
import { createWorld } from "@workflow/world-postgres";
import { hydrateResourceIO, observabilityRevivers } from "workflow/observability";

type Loose = Record<string, unknown>;
const hydrate = (r: unknown): Loose => hydrateResourceIO(r as never, observabilityRevivers) as Loose;

function pick<T = unknown>(o: Loose, ...keys: string[]): T | undefined {
  for (const k of keys) if (o[k] != null) return o[k] as T;
  return undefined;
}

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

function preview(value: unknown, max = 800): string {
  try {
    const s = JSON.stringify(value) ?? String(value);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  } catch {
    return String(value);
  }
}

/** A build step's input is the buildChannel(...) args tuple: [channel, packageId, sourceId, userId, …]. */
type Plannedish = {
  key?: string;
  name?: string;
  number?: number;
  theme?: string;
  filter?: unknown;
  mediaTypes?: string[];
};

async function main() {
  const argRun = process.argv[2];
  const world = createWorld() as unknown as {
    runs: { list: (o: { resolveData?: "all" | "none"; pagination?: { cursor?: string } }) => Promise<{ data: Loose[]; cursor?: string }> };
    steps: { list: (o: { runId: string; resolveData?: "all" | "none"; pagination?: { cursor?: string } }) => Promise<{ data: Loose[]; cursor?: string }> };
  };

  // Resolve the run.
  let runId = argRun;
  if (!runId) {
    const runs = await listAll((o) => world.runs.list(o), "none");
    const latest = runs
      .filter((r) => String(pick(r, "name", "workflowName") ?? "").includes("aiLineupWorkflow"))
      .sort(
        (a, b) =>
          new Date(String(pick(b, "createdAt", "created_at") ?? 0)).getTime() -
          new Date(String(pick(a, "createdAt", "created_at") ?? 0)).getTime(),
      )[0];
    runId = latest ? String(pick(latest, "runId", "id")) : undefined;
    if (!runId) return console.log("No aiLineupWorkflow runs found.");
  }
  const rid = runId;
  console.log(`\n=== SEED from run ${rid}\n`);

  // All steps (paginated), hydrated.
  const steps = (await listAll((o) => world.steps.list({ runId: rid, ...o }), "all")).map(hydrate);
  const nameOf = (s: Loose) => String(pick(s, "stepName", "step_name") ?? "");

  // ── The plan draft (planLineup output) ───────────────────────────────────────────────────────
  const planStep = steps.find((s) => nameOf(s).includes("planLineup"));
  const draft = planStep ? (pick(planStep, "output") as { packages?: { key?: string; existingKey?: string | null; channels?: Plannedish[] }[] } | undefined) : undefined;
  const draftPkgs = draft?.packages ?? [];
  const draftChannels = draftPkgs.reduce((n, p) => n + (p.channels?.length ?? 0), 0);
  console.log(`PLAN DRAFT: ${planStep ? `${draftPkgs.length} packages, ${draftChannels} channels` : "MISSING (no planLineup step)"}`);
  // Map channel key -> package key, from the draft (what apply's createPackages needs).
  const pkgKeyByChannel = new Map<string, string>();
  for (const p of draftPkgs) for (const c of p.channels ?? []) if (c.key && p.key) pkgKeyByChannel.set(c.key, p.key);

  // ── Per-channel: input (PlannedChannel + packageId + number) + output (committed filter + status) ──
  const buildSteps = steps.filter((s) => nameOf(s).includes("buildChannel"));
  type SeedChannel = {
    key?: string;
    number?: number;
    packageId?: string;
    packageKey?: string;
    status?: string;
    poolSize?: number;
    hasCommittedFilter: boolean;
    committedFilter?: unknown;
    proposedFilter?: unknown;
  };
  const seed: SeedChannel[] = [];
  for (const s of buildSteps) {
    // A step's input is the args tuple wrapped as `{ args: [channel, packageId, sourceId, …] }` (a run's
    // input is a bare `[args]` array — different shape). Unwrap `.args` when present.
    const input = pick(s, "input");
    const tuple = ((Array.isArray(input) ? input : (input as { args?: unknown[] } | undefined)?.args) ?? []) as unknown[];
    const channel = tuple[0] as Plannedish | undefined;
    const packageId = tuple[1] as string | undefined;
    const output = pick(s, "output") as
      | { status?: string; poolSize?: number; committedFilter?: unknown; committedMediaTypes?: string[] }
      | undefined;
    seed.push({
      key: channel?.key,
      number: channel?.number,
      packageId,
      packageKey: channel?.key ? pkgKeyByChannel.get(channel.key) : undefined,
      status: output?.status,
      poolSize: output?.poolSize,
      hasCommittedFilter: output?.committedFilter != null,
      committedFilter: output?.committedFilter,
      proposedFilter: channel?.filter,
    });
  }

  const withCommitted = seed.filter((c) => c.hasCommittedFilter).length;
  console.log(`BUILD STEPS: ${buildSteps.length}  ·  with committedFilter: ${withCommitted}/${seed.length}`);

  // The dry-run replay re-runs in-flight builds, so the OBSERVABILITY table (AiLineupTrace) gets a row per
  // EXECUTION — that's the "tons of duplicates" you see on the run page / gantt. The SDK step layer
  // (world.steps, keyed by run_id+step_id) is one-per-channel, which is what loadSeed reads. Show both.
  const traceBuilds = await prisma.aiLineupTrace.groupBy({
    by: ["channelKey"],
    where: { runId: rid, phase: "build" },
    _count: true,
  });
  const traceRows = traceBuilds.reduce((n, r) => n + r._count, 0);
  const dupChannels = traceBuilds.filter((r) => r._count > 1).length;
  console.log(
    `SEED SOURCE vs OBSERVABILITY: world.steps builds = ${buildSteps.length} (one per channel, the seed source) · ` +
      `AiLineupTrace build rows = ${traceRows} across ${traceBuilds.length} channels ` +
      `(${dupChannels} channel(s) have duplicate executions — these live only in the trace table, not the seed).`,
  );
  if (withCommitted === 0 && seed.length > 0) {
    console.log("  ⚠ committedFilter is absent — this run predates the capture. Run a FRESH dry run to validate apply (#32).");
  }
  console.log();

  // Print each channel's seed line.
  for (const c of seed.slice(0, 40)) {
    console.log(
      `  ${String(c.number ?? "—").padEnd(5)} ${String(c.key ?? "?").padEnd(28)} ` +
        `pkg=${String(c.packageKey ?? c.packageId ?? "?").padEnd(18)} ${String(c.status ?? "?").padEnd(9)} ` +
        `pool=${String(c.poolSize ?? "?").padEnd(5)} committed=${c.hasCommittedFilter ? "yes" : "NO"}`,
    );
  }
  if (seed.length > 40) console.log(`  … +${seed.length - 40} more`);

  // Show one fully-assembled seed channel, both what apply and rebuild would consume.
  const sample = seed.find((c) => c.hasCommittedFilter) ?? seed[0];
  if (sample) {
    console.log(`\n--- SAMPLE seed channel "${sample.key}" ---`);
    console.log(`  apply   would materialize: number(re-assigned), committedFilter=${preview(sample.committedFilter)}`);
    console.log(`  rebuild would re-run AI:   number=${sample.number}, packageId=${sample.packageId}, proposedFilter=${preview(sample.proposedFilter)}`);
  }

  console.log(`\nOK — loadSeed can read draft + per-channel input/output for this run via the observability API.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
