/**
 * Recording what an AI lineup run actually DID (§7.3a observability).
 *
 * The Workflow SDK persists every step's input and output already, so this is not a copy of
 * that. It exists for the two things WDK structurally cannot give us:
 *
 *  1. **The inside of a step.** A channel build is ONE step wrapping a whole `generateText`
 *     tool loop — its previews, its filter revisions, and its reasoning are invisible from
 *     the outside. That's precisely the part worth reading.
 *  2. **Honest cost.** The run report aggregated usage only from builds that SUCCEEDED, which
 *     understated a run three ways: the planner call (on a pricier model) was never counted,
 *     retries were free, and everything was priced at worker rates. A row per ATTEMPT fixes
 *     all three — a failed attempt leaves its own row with its own tokens.
 *
 * Recording must never be able to fail a run: a trace write that throws would turn a
 * successful, expensive channel build into a retry. Every write here is best-effort.
 */
import type { PrismaClient } from "@airwave/db";

export type TracePhase =
  | "analyze"
  | "context"
  | "plan"
  | "packages"
  | "numbering"
  | "build"
  | "report";

/**
 * Identifies the run/step a service call belongs to.
 *
 * Passed IN rather than read here: `getWorkflowMetadata()` / `getStepMetadata()` live in the
 * Workflow SDK, and `packages/api` must never import it — that dependency inversion is what
 * keeps these services usable (and the server bootable) with the engine switched off. The
 * workflow reads the metadata and hands it down.
 */
export type TraceContext = {
  runId: string;
  stepId?: string;
  attempt?: number;
};

export type TraceUsage = {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  agentSteps?: number;
};

export type TraceInput = {
  runId: string;
  stepId?: string | null;
  stepName: string;
  attempt?: number;
  phase: TracePhase;
  channelKey?: string | null;
  channelNumber?: number | null;
  channelName?: string | null;
  status: "ok" | "skipped" | "failed";
  reason?: string | null;
  input?: unknown;
  output?: unknown;
  trace?: unknown;
  usage?: TraceUsage;
  error?: string | null;
  startedAt?: Date;
};

/** Postgres JSONB has no size limit worth hitting, but a runaway payload helps nobody. */
const MAX_JSON_CHARS = 200_000;

/**
 * JSON-safe and size-capped. A preview result can be enormous, and `undefined` / `Date` /
 * `BigInt` all break `Prisma.JsonValue` — round-tripping through JSON normalizes them and
 * makes a too-large payload degrade to a note instead of throwing at insert time.
 */
function toJson(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  try {
    const text = JSON.stringify(value);
    if (text === undefined) return undefined;
    if (text.length > MAX_JSON_CHARS) {
      return { truncated: true, chars: text.length, preview: text.slice(0, 2_000) };
    }
    return JSON.parse(text);
  } catch {
    return { unserializable: true };
  }
}

/** Write one trace row. Best-effort: never throws into the caller. */
export async function recordTrace(prisma: PrismaClient, t: TraceInput): Promise<void> {
  try {
    await prisma.aiLineupTrace.create({
      data: {
        runId: t.runId,
        stepId: t.stepId ?? null,
        stepName: t.stepName,
        attempt: t.attempt ?? 1,
        phase: t.phase,
        channelKey: t.channelKey ?? null,
        channelNumber: t.channelNumber ?? null,
        channelName: t.channelName ?? null,
        status: t.status,
        reason: t.reason ?? null,
        input: toJson(t.input) as never,
        output: toJson(t.output) as never,
        trace: toJson(t.trace) as never,
        model: t.usage?.model ?? null,
        inputTokens: t.usage?.inputTokens ?? 0,
        outputTokens: t.usage?.outputTokens ?? 0,
        cacheReadTokens: t.usage?.cacheReadTokens ?? 0,
        cacheWriteTokens: t.usage?.cacheWriteTokens ?? 0,
        agentSteps: t.usage?.agentSteps ?? 0,
        error: t.error ?? null,
        startedAt: t.startedAt ?? new Date(),
        finishedAt: new Date(),
      },
    });
  } catch (err) {
    // Deliberately swallowed — see the header. Losing a trace row is a nuisance; failing a
    // completed channel build because we couldn't log it is a real cost.
    console.warn(`[trace] failed to record ${t.stepName}/${t.phase}:`, err);
  }
}

/**
 * One trace row as the admin UI sees it.
 *
 * Declared explicitly rather than leaking the Prisma row: `Prisma.JsonValue` is a deeply
 * recursive union, and inferring it through tRPC tips the client compiler straight into
 * `TS2589: Type instantiation is excessively deep and possibly infinite`. Widening the three
 * JSON columns to `unknown` keeps the inferred router type shallow — and the page treats them
 * as opaque JSON anyway.
 */
export type LineupTraceRow = {
  id: string;
  runId: string;
  stepId: string | null;
  stepName: string;
  attempt: number;
  phase: string;
  channelKey: string | null;
  channelNumber: number | null;
  channelName: string | null;
  status: string;
  reason: string | null;
  input: unknown;
  output: unknown;
  trace: unknown;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  agentSteps: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

/** Every trace row for a run, oldest first — the run detail page's data. */
export async function listRunTraces(
  prisma: PrismaClient,
  runId: string,
): Promise<LineupTraceRow[]> {
  const rows = await prisma.aiLineupTrace.findMany({
    where: { runId },
    orderBy: { startedAt: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    input: r.input as unknown,
    output: r.output as unknown,
    trace: r.trace as unknown,
  }));
}

/**
 * True cost for a run, across every phase AND every attempt.
 *
 * Grouped by model because that's what makes it meaningful: the planner and the workers run
 * on different models at different prices, and a single blended number is how a run came to
 * be reported at $0.16 when it wasn't.
 */
export async function summarizeRunUsage(prisma: PrismaClient, runId: string) {
  const rows = await prisma.aiLineupTrace.groupBy({
    by: ["model", "phase"],
    where: { runId },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      cacheReadTokens: true,
      cacheWriteTokens: true,
      agentSteps: true,
    },
    _count: true,
  });

  return rows.map((r) => ({
    model: r.model ?? "unknown",
    phase: r.phase,
    calls: r._count,
    inputTokens: r._sum.inputTokens ?? 0,
    outputTokens: r._sum.outputTokens ?? 0,
    cacheReadTokens: r._sum.cacheReadTokens ?? 0,
    cacheWriteTokens: r._sum.cacheWriteTokens ?? 0,
    agentSteps: r._sum.agentSteps ?? 0,
  }));
}
