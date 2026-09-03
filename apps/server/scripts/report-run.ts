/**
 * Full, decoded report of an AI lineup workflow run.
 *
 * The Workflow inspector (scripts/workflow-ui.ts) and the AI-Lineup run detail page already show
 * step status + timing. This pulls the two things they keep locked in the world's CBOR columns —
 * the run ARGS (input_cbor) and the final REPORT body (output_cbor) — and flags duplicate channel
 * builds, so you can confirm at a glance whether a run was a dry run (created nothing), what it was
 * dispatched with (dryRun / plannerMaxOutputTokens / concurrency / limit), and what it produced.
 *
 * Run: bun --env-file=.env scripts/report-run.ts [runId]
 *   With no runId it reports the most recent aiLineupWorkflow run.
 */
import prisma from "@airwave/db";
import { decode } from "cbor-x";
import { parse as devalueParse } from "devalue";

type Args = {
  sourceId?: string;
  mode?: string;
  limit?: number;
  concurrency?: number;
  plannerMaxOutputTokens?: number;
  dryRun?: boolean;
};
type BuildResult = {
  key?: string;
  name?: string;
  number?: number;
  status?: string;
  channelId?: string;
  poolSize?: number;
  reason?: string;
};
type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  steps?: number;
  channelsWithUsage?: number;
};
type Report = {
  dryRun?: boolean;
  packagesCreated?: number;
  channelsPlanned?: number;
  channelsCreated?: number;
  skipped?: BuildResult[];
  failed?: BuildResult[];
  usage?: Usage;
};
type RunRow = {
  id: string;
  name: string;
  status: string;
  error: string | null;
  created_at: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  input_cbor: Buffer | null;
  output_cbor: Buffer | null;
};
type StepRow = {
  step_id: string;
  step_name: string;
  status: string;
  attempt: number;
  error: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  output_cbor: Buffer | null;
};

/**
 * Decode a world CBOR column. The Workflow SDK stores each value as a CBOR byte string whose bytes are
 * UTF-8 text prefixed with `devl` — i.e. `devalue.stringify` output (devalue handles Dates/cycles/etc.).
 * So the chain is: cbor-decode → bytes → utf8 → strip the `devl` marker → devalue.parse.
 * If a value ever comes back already-structured (not a byte string), pass it through.
 */
function dec<T>(b: Buffer | null): T | null {
  if (!b) return null;
  try {
    const raw = decode(b);
    if (raw instanceof Uint8Array) {
      const text = Buffer.from(raw).toString("utf8");
      const body = text.startsWith("devl") ? text.slice(4) : text;
      return devalueParse(body) as T;
    }
    return raw as T;
  } catch {
    return null;
  }
}
/** The SDK stores workflow input as the args tuple `[args]`; unwrap a single-element array. */
function unwrapArgs(raw: unknown): Args {
  if (Array.isArray(raw)) return (raw[0] as Args) ?? {};
  return (raw as Args) ?? {};
}
function secs(a: Date | null, b: Date | null): string {
  return a && b ? `${Math.round((b.getTime() - a.getTime()) / 1000)}s` : "—";
}
function shortName(s: string): string {
  return String(s).split("//").pop() ?? s;
}
function iso(d: Date | null): string {
  return d instanceof Date ? d.toISOString() : String(d ?? "—");
}
function num(n: number | undefined): string {
  return typeof n === "number" ? n.toLocaleString() : "?";
}

async function main() {
  const argRun = process.argv[2];
  const runs = await prisma.$queryRawUnsafe<RunRow[]>(
    argRun
      ? `SELECT id, name, status::text AS status, error, created_at, started_at, completed_at, input_cbor, output_cbor
         FROM workflow.workflow_runs WHERE id = $1`
      : `SELECT id, name, status::text AS status, error, created_at, started_at, completed_at, input_cbor, output_cbor
         FROM workflow.workflow_runs WHERE name LIKE '%aiLineupWorkflow%'
         ORDER BY created_at DESC LIMIT 1`,
    ...(argRun ? [argRun] : []),
  );
  const run = runs[0];
  if (!run) {
    console.log(argRun ? `No run ${argRun}.` : "No aiLineupWorkflow runs found.");
    return;
  }

  const args = unwrapArgs(dec(run.input_cbor));
  const report = dec<Report>(run.output_cbor);

  console.log(`\n=== RUN ${run.id}`);
  console.log(`  workflow: ${shortName(run.name)}`);
  console.log(`  status:   ${run.status}${run.error ? `   ERROR: ${run.error}` : ""}`);
  console.log(`  created:  ${iso(run.created_at)}`);
  console.log(`  duration: ${secs(run.started_at, run.completed_at)}`);

  console.log(`\n--- ARGS`);
  console.log(`  sourceId:               ${args.sourceId ?? "—"}`);
  console.log(`  mode:                   ${args.mode ?? "quality"}`);
  console.log(`  limit:                  ${args.limit ?? "(uncapped)"}`);
  console.log(`  concurrency:            ${args.concurrency ?? "(default)"}`);
  console.log(`  plannerMaxOutputTokens: ${args.plannerMaxOutputTokens ?? "(default 32000)"}`);
  console.log(`  dryRun:                 ${args.dryRun ? "YES — persists nothing" : "no"}`);

  const steps = await prisma.$queryRawUnsafe<StepRow[]>(
    `SELECT step_id, step_name, status::text AS status, attempt, error, started_at, completed_at, output_cbor
     FROM workflow.workflow_steps WHERE run_id = $1 ORDER BY created_at ASC`,
    run.id,
  );

  // Collapse retries: keep the terminal (highest-attempt) row per step_id, so the step list and the
  // duplicate check reflect distinct planned work rather than counting a retry as a second build.
  const terminal = new Map<string, StepRow>();
  for (const s of steps) {
    const prev = terminal.get(s.step_id);
    if (!prev || s.attempt > prev.attempt) terminal.set(s.step_id, s);
  }

  console.log(`\n--- STEPS (${terminal.size} unique; ${steps.length} rows incl. retries)`);
  const builds: BuildResult[] = [];
  const ordered = [...terminal.values()].sort(
    (a, b) => (a.started_at?.getTime() ?? 0) - (b.started_at?.getTime() ?? 0),
  );
  for (const s of ordered) {
    const nm = shortName(s.step_name);
    const dur = secs(s.started_at, s.completed_at);
    const retry = s.attempt > 1 ? `  ⚠ attempt ${s.attempt}` : "";
    let extra = "";
    if (nm.includes("buildChannel")) {
      const o = dec<BuildResult>(s.output_cbor);
      if (o) {
        builds.push(o);
        extra =
          `  → #${o.number} ${o.name} :: ${o.status}` +
          (o.poolSize != null ? ` (pool ${o.poolSize})` : "") +
          (o.reason ? ` — ${o.reason}` : "");
      }
    }
    console.log(`  ${nm.padEnd(20)} ${String(s.status).padEnd(10)} ${dur.padStart(6)}${retry}${extra}`);
    if (s.error) console.log(`      ERROR: ${String(s.error).slice(0, 300)}`);
  }

  // Duplicate detection: the same channel number produced by more than one distinct build step.
  const byNum = new Map<number, number>();
  for (const b of builds) if (typeof b.number === "number") byNum.set(b.number, (byNum.get(b.number) ?? 0) + 1);
  const dupes = [...byNum.entries()].filter(([, n]) => n > 1);
  console.log(`\n--- DUPLICATE BUILDS`);
  if (dupes.length) {
    for (const [n, count] of dupes) console.log(`  ⚠ channel #${n} built by ${count} separate steps`);
  } else {
    console.log(`  none — every channel built by exactly one step`);
  }

  console.log(`\n--- REPORT`);
  if (!report) {
    console.log(`  (no report output — run is ${run.status})`);
  } else {
    console.log(`  dryRun:          ${report.dryRun ? "YES — nothing persisted" : "no"}`);
    console.log(`  packagesCreated: ${report.packagesCreated ?? "?"}`);
    console.log(`  channelsPlanned: ${report.channelsPlanned ?? "?"}`);
    console.log(`  channelsCreated: ${report.channelsCreated ?? "?"}`);
    console.log(`  skipped:         ${report.skipped?.length ?? 0}`);
    for (const s of report.skipped ?? []) console.log(`      #${s.number} ${s.name} — ${s.reason ?? ""}`);
    console.log(`  failed:          ${report.failed?.length ?? 0}`);
    for (const f of report.failed ?? []) console.log(`      #${f.number} ${f.name} — ${f.reason ?? ""}`);
    const u = report.usage;
    if (u) {
      console.log(
        `  tokens: in=${num(u.inputTokens)} (cacheRead ${num(u.cacheReadTokens)}, ` +
          `cacheWrite ${num(u.cacheWriteTokens)}) out=${num(u.outputTokens)} ` +
          `over ${u.steps ?? "?"} steps / ${u.channelsWithUsage ?? "?"} builds`,
      );
    }
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
