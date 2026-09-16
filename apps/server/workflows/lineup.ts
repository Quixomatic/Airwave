/**
 * The AI lineup workflow (§7.3a) — analyze → plan → build → report.
 *
 * Replaces the static preset generator's rule-based curation with real understanding:
 * it looks at what's ACTUALLY in the library and decides what channels should exist,
 * instead of evaluating 184 hardcoded presets. Runs autonomously (no per-write approval
 * — that gate lives in the agent-tools WRAPPER, not the services this calls), and every
 * row it creates is stamped `aiGenerated` so a whole run is reversible.
 *
 * Fully implemented: analyze reads the real library, plan is a structured-output call,
 * build runs a grounded per-channel agent that verifies its filter before creating, and
 * every created channel gets a windowed initial schedule so it's watchable immediately.
 *
 * Durability notes (the whole reason this is a workflow and not a Job):
 *  - `"use workflow"` = the deterministic orchestrator. NO side effects here — no I/O,
 *    no Date.now(), no Math.random(). It replays from the event log on resume.
 *  - `"use step"` = the actual work. Auto-retried, result persisted, never re-run once
 *    complete. A crash mid-build resumes only the unfinished channels.
 *  - Step params and return values must be JSON-serializable.
 *
 * After editing this file you MUST re-run `bunx workflow build` — `bun --hot` does not
 * pick up workflow changes (the directives are a build-time transform).
 */
import prisma from "@airwave/db";
import { FatalError, getStepMetadata, getWorkflowMetadata } from "workflow";
import { hydrateResourceIO, observabilityRevivers } from "workflow/observability";
import { getWorld } from "workflow/runtime";

import type { ChannelBuildResult } from "@airwave/api/services/agent/channel-builder";
import { buildPlannedChannel } from "@airwave/api/services/agent/channel-builder";
import type { LibraryProfile } from "@airwave/api/services/agent/library-profile";
import {
  buildFilterVocabulary,
  buildLibraryProfile,
  formatFieldCatalog,
  formatFilterVocabulary,
  formatLibraryProfile,
} from "@airwave/api/services/agent/library-profile";
import type {
  ExistingPackage,
  LineupPlan,
  LineupPlanDraft,
  PlannedChannel,
} from "@airwave/api/services/agent/lineup-plan";
import {
  assignChannelNumbers,
  formatLineupPlan,
  PlanFatalError,
  planLineup as planLineupService,
} from "@airwave/api/services/agent/lineup-plan";
import type { LineupRunArgs, LineupSeed, SeedMode } from "@airwave/api/services/agent/lineup-runner";
import { recordTrace, type TracePhase } from "@airwave/api/services/agent/lineup-trace";
import { clearAiGenerated, createChannel, createPackage, discoverFieldValues } from "@airwave/api/services/agent/tools";
import {
  INITIAL_WINDOW_SECONDS,
  generateChannelSchedule,
} from "@airwave/api/services/schedule/generate";

export type { LibraryProfile, LineupPlan, PlannedChannel, ChannelBuildResult };

/**
 * How many channel builds run at once. Each is an agent loop making several tool calls,
 * so this is really a cap on concurrent LLM conversations — high enough to finish 50
 * channels in reasonable time, low enough to stay under provider rate limits.
 */
const BUILD_CONCURRENCY = 6;

/**
 * Identify the run + attempt from INSIDE a step, so trace rows join back to the step timeline.
 *
 * Only callable within a `"use step"` function — `getStepMetadata()` throws in the workflow
 * body — and it's read here rather than in `packages/api` because those services must never
 * import the Workflow SDK (the inversion that keeps the server bootable with the engine off).
 *
 * `attempt` is the load-bearing field: a retried step writes a SECOND trace row instead of
 * overwriting, which is what finally makes retries visible in the cost accounting.
 */
function traceContext() {
  const { workflowRunId } = getWorkflowMetadata();
  const { stepId, attempt } = getStepMetadata();
  return { runId: workflowRunId, stepId, attempt };
}

/**
 * Record a phase's trace row from inside a step, so the observability timeline (and the scrubber) sees
 * EVERY phase, not just the plan + per-channel builds. `startedAt` is captured at the top of the step so the
 * row carries a real duration. Best-effort (recordTrace never throws). Only callable inside a `"use step"`.
 */
async function tracePhase(
  startedAt: Date,
  stepName: string,
  phase: TracePhase,
  output?: unknown,
): Promise<void> {
  await recordTrace(prisma, { ...traceContext(), stepName, phase, status: "ok", output, startedAt });
}

/** How often a long step checks whether its run was cancelled, so Stop aborts an in-flight model call. */
const CANCEL_POLL_MS = 4_000;

/**
 * True once the run has been cancelled/aborted. Read from the world's OWN run table via raw SQL (same
 * source `lineup-runs.ts` uses) rather than the WDK client, so it's cheap and safe to call repeatedly from
 * inside a step. Best-effort: a failed status read must never fail the step.
 */
async function isRunCancelled(runId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT status::text AS status FROM workflow.workflow_runs WHERE id = $1`,
      runId,
    );
    const s = rows[0]?.status;
    return s === "cancelled" || s === "aborted";
  } catch {
    return false;
  }
}

/**
 * Run a step's expensive AI work with COOPERATIVE cancellation (#28).
 *
 * The WDK's `cancel()` marks the run terminal and stops FUTURE steps, but it does NOT abort an in-flight JS
 * step (that auto-abort is Python-only here). So a planner/build call (~minutes on the GPU) would keep
 * running after Stop. Fix: poll the run status and, when it flips to cancelled, trip an `AbortSignal` that the
 * service forwards to `generateText`/`generateObject` — which tears down the model call (and the whole tool
 * loop). Cancellation lands within ~one poll interval, not instantly, which is fine for a multi-minute call.
 *
 * Only callable inside a `"use step"` (reads `getWorkflowMetadata`). The runId is captured up front so the
 * interval closure doesn't depend on async-local context that a timer callback wouldn't have.
 */
async function withRunCancellation<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const { workflowRunId } = getWorkflowMetadata();
  const controller = new AbortController();
  const timer = setInterval(() => {
    void isRunCancelled(workflowRunId).then((cancelled) => {
      if (cancelled && !controller.signal.aborted) {
        console.log(`[lineup] run ${workflowRunId} cancelled — aborting in-flight step call`);
        controller.abort();
      }
    });
  }, CANCEL_POLL_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearInterval(timer);
  }
}

// ---------------------------------------------------------------------------
// Seed (Workstreams C+D) — reuse a previous run's data instead of planning fresh.
// ---------------------------------------------------------------------------

/** A channel's verified outcome from the source run, deduped by key — what `apply` materializes. */
type SeedOutcome = {
  /** The dry run's build committed a channel (would-create) vs skipped/failed it. */
  wouldCreate: boolean;
  /** The filter the agent COMMITTED — apply persists this verbatim, no AI. */
  committedFilter?: unknown;
  committedMediaTypes?: string[];
  poolSize?: number;
  reason?: string;
};

/** Fully-resolved seed: the source run's draft + per-channel outcomes, read once via the observability API. */
type ResolvedSeed = {
  mode: SeedMode;
  channelKeys?: string[];
  draft: LineupPlanDraft;
  /** by channel key (deduped) — apply materializes these. */
  outcomes: Record<string, SeedOutcome>;
  /** by channel key — the source run's existing packageId + number (rebuild reuses these). */
  sourceChannels: Record<string, { number?: number; packageId?: string }>;
};

type Loose = Record<string, unknown>;

/**
 * Read everything a seeded run needs from the SOURCE run, via the supported observability API (validated by
 * `scripts/seed-probe.ts`). The plan DRAFT (planLineup output) is the canonical channel list; per-channel
 * committed outcomes come from the buildChannel step OUTPUTS. The SDK step layer is one-step-per-channel, so
 * the dry-run replay's duplicate EXECUTIONS (which only bloat the trace table) aren't seen here — but we
 * still dedupe by key, preferring an outcome that actually committed a filter, as belt-and-suspenders.
 *
 * Its own durable step: the read is memoized, so a resumed run reuses the identical seed.
 */
async function loadSeed(seed: LineupSeed): Promise<ResolvedSeed> {
  "use step";
  const world = getWorld() as unknown as {
    steps: {
      list: (o: { runId: string; resolveData?: "all" | "none"; pagination?: { cursor?: string } }) => Promise<{
        data: Loose[];
        cursor?: string;
      }>;
    };
  };
  const hydrate = (r: Loose): Loose => hydrateResourceIO(r as never, observabilityRevivers) as Loose;
  const pick = (o: Loose, ...keys: string[]): unknown => {
    for (const k of keys) if (o[k] != null) return o[k];
    return undefined;
  };

  // All steps, paginated (the SDK returns ~20 rows + a cursor per page).
  const rows: Loose[] = [];
  let cursor: string | undefined;
  do {
    const page = await world.steps.list({
      runId: seed.fromRunId,
      resolveData: "all",
      pagination: cursor ? { cursor } : {},
    });
    rows.push(...page.data);
    cursor = page.cursor;
  } while (cursor);
  const steps = rows.map(hydrate);
  const nameOf = (s: Loose) => String(pick(s, "stepName", "step_name") ?? "");

  const planStep = steps.find((s) => nameOf(s).includes("planLineup"));
  const draft = (planStep ? pick(planStep, "output") : undefined) as LineupPlanDraft | undefined;
  if (!draft?.packages?.length) {
    // Deterministic: a run with no plan draft can never be seeded from. Fail terminally, don't retry.
    throw new FatalError(`Seed run ${seed.fromRunId} has no plan draft to build from.`);
  }

  const outcomes: Record<string, SeedOutcome> = {};
  const sourceChannels: Record<string, { number?: number; packageId?: string }> = {};
  for (const s of steps) {
    if (!nameOf(s).includes("buildChannel")) continue;
    const input = pick(s, "input");
    const tuple = ((Array.isArray(input) ? input : (input as { args?: unknown[] } | undefined)?.args) ?? []) as unknown[];
    const channel = tuple[0] as { key?: string; number?: number } | undefined;
    const packageId = tuple[1] as string | undefined;
    const output = pick(s, "output") as
      | { key?: string; status?: string; poolSize?: number; committedFilter?: unknown; committedMediaTypes?: string[]; reason?: string }
      | undefined;
    const key = channel?.key ?? output?.key;
    if (!key) continue;
    // Dedupe: keep the outcome that actually committed a filter over one that didn't.
    const existing = outcomes[key];
    if (existing && existing.committedFilter != null && output?.committedFilter == null) continue;
    outcomes[key] = {
      wouldCreate: output?.status === "created",
      committedFilter: output?.committedFilter,
      committedMediaTypes: output?.committedMediaTypes,
      poolSize: output?.poolSize,
      reason: output?.reason,
    };
    sourceChannels[key] = { number: channel?.number, packageId };
  }

  console.log(
    `[lineup] loadSeed(${seed.mode}) from ${seed.fromRunId}: ${draft.packages.length} packages, ` +
      `${Object.keys(outcomes).length} channel outcomes` +
      (seed.channelKeys ? `, ${seed.channelKeys.length} target(s)` : ""),
  );
  return { mode: seed.mode, channelKeys: seed.channelKeys, draft, outcomes, sourceChannels };
}

// PlannedChannel / PlannedPackage / LineupPlan now live with the planner service
// (packages/api/.../lineup-plan.ts) so the Zod schema is the single source of truth —
// they're re-exported above.

// ChannelBuildResult lives with the builder service — re-exported above.

export type LineupReport = {
  sourceId: string;
  /** True when this was a dry run — nothing below was persisted; the channels are what it WOULD have built. */
  dryRun: boolean;
  packagesCreated: number;
  /** How many channels the planner designed — the full lineup, regardless of any build cap. */
  channelsPlanned: number;
  channelsCreated: number;
  skipped: ChannelBuildResult[];
  failed: ChannelBuildResult[];
  /** What the run cost. Surfaced so spend is visible without waiting for the bill. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Served from the shared prompt cache (~0.1x price) — proof the prefix sharing works. */
    cacheReadTokens: number;
    /** Written to the cache (~1.25x price) — paid once per run, by the first build. */
    cacheWriteTokens: number;
    steps: number;
    channelsWithUsage: number;
  };
};

/**
 * Entry point. `start(aiLineupWorkflow, [args])` returns a runId immediately; the run
 * outlives the caller and survives restarts.
 */
export async function aiLineupWorkflow(args: LineupRunArgs): Promise<LineupReport> {
  "use workflow";

  const dryRun = args.dryRun ?? false;

  // Seed (Workstreams C+D): reuse a previous run's data instead of planning fresh.
  const seed = args.seed ? await loadSeed(args.seed) : null;
  const apply = seed?.mode === "apply";
  if (seed?.mode === "rebuild") {
    // #23 rebuild-single lands in a follow-up. Guard here so a rebuild dispatch can NEVER reach the
    // destructive wipe below through a half-implemented path.
    throw new FatalError("rebuild-single (#23) is not yet implemented.");
  }

  // APPLY skips the AI entirely: the library analysis + shared context exist only to author filters, which
  // apply reuses from the dry run. A normal run does the full analysis before planning.
  const profile = apply ? null : await analyzeLibrary(args.sourceId);
  // The planner authors real filters, so it needs the actual tag vocabulary; the same string is then handed
  // to every builder byte-identically, so a normal run shares ONE prompt-cache entry.
  const libraryContext = profile ? await buildSharedContext(args.sourceId, profile) : "";

  // Plan: a seeded run reuses the source run's draft; a normal run reads existing packages and plans fresh.
  const existingPackages = seed ? [] : await listExistingPackages();
  const draft = seed ? seed.draft : await planLineup(libraryContext, existingPackages, args.plannerMaxOutputTokens);

  // Packages first, so each channel has a real packageId to attach to. This also wipes any previous AI
  // lineup — destructive, hence the confirmation on the admin action. APPLY wipes + recreates just like a
  // normal run (it replaces the lineup with what the dry run verified). In a DRY RUN it does NEITHER and
  // returns placeholder ids so the verify step can still run. See #22 dry-run.
  const packageIds = await createPackages(draft, dryRun);

  // Numbering runs AFTER the wipe, against real packages — which is exactly why APPLY re-numbers instead of
  // reusing the dry run's placeholder-based numbers. Its own step, so a resumed run replays it identically.
  const plan = await assignNumbers(draft, packageIds);

  // Flatten so the concurrency cap applies across the WHOLE lineup rather than per
  // package (package sizes vary, so per-package batching would idle).
  const allJobs = plan.packages.flatMap((pkg) =>
    pkg.channels.map((channel) => ({ channel, packageId: packageIds[pkg.key]! })),
  );

  // `limit` caps the BUILD fan-out, not the plan. The plan is one call and it's the
  // interesting artifact; the per-channel builds are what cost real money. So a capped run
  // still shows you the whole lineup it would build, and only pays to construct a sample.
  // Interleaved across packages rather than taking the first N, so the sample spans
  // different kinds of channel instead of one package's worth.
  const jobs = args.limit && !seed ? sampleAcrossPackages(allJobs, args.limit) : allJobs;
  if (args.limit && allJobs.length > jobs.length) {
    console.log(`[lineup] planned ${allJobs.length} channels; building ${jobs.length} (limit)`);
  }

  // Fan out in bounded waves. Each build is its own durable step, so a crash resumes
  // only the unfinished ones. The cap keeps us under the provider's rate limit — every
  // build is an agent loop with several tool calls of its own.
  const built: ChannelBuildResult[] = [];
  const concurrency = args.concurrency ?? BUILD_CONCURRENCY; // AppSettings.channelBuildConcurrency, else default
  for (let i = 0; i < jobs.length; i += concurrency) {
    const wave = jobs.slice(i, i + concurrency);
    const results = await Promise.all(
      wave.map((job) =>
        apply
          ? // APPLY: persist the dry run's verified outcome, no agent loop.
            materializeChannel(job.channel, job.packageId, seed!.outcomes[job.channel.key], args.userId, args.sourceId)
          : buildChannel(
              job.channel,
              job.packageId,
              args.sourceId,
              args.userId,
              libraryContext,
              args.mode ?? "quality",
              dryRun,
            ),
      ),
    );
    built.push(...results);
  }

  return await reportLineup(args.sourceId, plan, built, dryRun);
}

/**
 * Pick `limit` jobs spread ACROSS packages rather than the first N.
 *
 * Taking the head of the list gives you one package's worth of channels, which is a poor
 * sample: the first package is usually the most obvious one (franchises, blockbusters), so
 * a capped run would only ever exercise the easy cases and never the interpretive channels
 * that are the real test. Round-robin gives a cross-section of the lineup instead.
 *
 * Pure function over the flattened list — no I/O — so it's safe in the workflow body.
 */
function sampleAcrossPackages<T extends { packageId: string }>(jobs: T[], limit: number): T[] {
  const byPackage = new Map<string, T[]>();
  for (const j of jobs) {
    const list = byPackage.get(j.packageId);
    if (list) list.push(j);
    else byPackage.set(j.packageId, [j]);
  }
  const queues = [...byPackage.values()];
  const out: T[] = [];
  for (let round = 0; out.length < limit; round++) {
    let placed = false;
    for (const q of queues) {
      if (round >= q.length) continue;
      out.push(q[round]!);
      placed = true;
      if (out.length >= limit) break;
    }
    if (!placed) break; // every queue exhausted
  }
  return out;
}

// ---------------------------------------------------------------------------
// Steps — each is durable, retried, and checkpointed independently.
// ---------------------------------------------------------------------------

/** §4.1 — distill the library into a few-KB profile the planner can reason over. */
async function analyzeLibrary(sourceId: string): Promise<LibraryProfile> {
  "use step";
  const startedAt = new Date();
  const profile = await buildLibraryProfile(prisma, sourceId);
  console.log(
    `[lineup] analyze: ${profile.totals.movies} movies / ${profile.totals.shows} shows / ` +
      `${profile.totals.episodes} episodes · ${profile.genres.length} genres · ` +
      `${profile.studios.length} studios · ${profile.topShows.length} sizeable shows`,
  );
  await tracePhase(startedAt, "analyzeLibrary", "analyze", {
    movies: profile.totals.movies,
    shows: profile.totals.shows,
    episodes: profile.totals.episodes,
    genres: profile.genres.length,
    studios: profile.studios.length,
  });
  return profile;
}

/**
 * Build the shared cached prefix: the library profile plus the FULL tag vocabulary.
 *
 * Its own step so the Plex round-trips (one per field) are checkpointed and never repeat
 * on a resume. Sent whole, untruncated — it's cached, so size costs almost nothing after
 * the first build, and a complete vocabulary is what stops the agent inventing tag values.
 */
async function buildSharedContext(sourceId: string, profile: LibraryProfile): Promise<string> {
  "use step";
  const startedAt = new Date();
  const vocabulary = await buildFilterVocabulary((field) =>
    discoverFieldValues(prisma, { mediaSourceId: sourceId, mediaTypes: ["movie", "show"], field }),
  );
  const text = [
    formatLibraryProfile(profile),
    "",
    // The CATALOG (which fields exist) is deliberately separate from the VOCABULARY (which
    // values exist). Only tag fields have listable values, so folding the two together left
    // every numeric/boolean field invisible — see formatFieldCatalog.
    "FILTERABLE FIELDS — every field you can build a condition on:",
    formatFieldCatalog(),
    "",
    "FILTER VOCABULARY — the exact TAG VALUES available. For these fields, use ONLY these values:",
    formatFilterVocabulary(vocabulary),
  ].join("\n");
  console.log(
    `[lineup] shared context: ${vocabulary.length} fields, ${text.length} chars (~${Math.ceil(text.length / 4)} tokens, cached once for the whole run)`,
  );
  await tracePhase(startedAt, "buildSharedContext", "context", {
    fields: vocabulary.length,
    chars: text.length,
    approxTokens: Math.ceil(text.length / 4),
  });
  return text;
}

/**
 * The packages already on the server — preset, hand-made, and any from a previous AI run.
 * Read BEFORE the wipe on purpose: the planner should be able to see (and prefer) the
 * owner's own organisation, and knowing which packages are `ai` tells it which ones are
 * about to be replaced anyway.
 */
async function listExistingPackages(): Promise<ExistingPackage[]> {
  "use step";
  const startedAt = new Date();
  const rows = await prisma.channelPackage.findMany({
    orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
    select: {
      key: true,
      name: true,
      description: true,
      aiGenerated: true,
      generated: true,
      _count: { select: { channels: true } },
    },
  });
  // EXCLUDE previous AI packages. `createPackages` wipes every `aiGenerated` package before
  // resolving reuse, so offering one guarantees the lookup misses and falls back to creating
  // a new package — which is exactly the near-duplicate sprawl reuse exists to prevent. The
  // first run with reuse "reused" 15 of 15 packages, but 7 targeted the previous run's own AI
  // packages and were silently recreated. Only the owner's real organisation is a valid target.
  const packages = rows
    .filter((p) => !p.aiGenerated)
    .map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      origin: (p.generated ? "preset" : "manual") as ExistingPackage["origin"],
      channelCount: p._count.channels,
    }));
  console.log(
    `[lineup] existing packages: ${packages.length} offered to the planner ` +
      `(${rows.length - packages.length} AI packages excluded — they're wiped before reuse resolves)`,
  );
  await tracePhase(startedAt, "listExistingPackages", "context", {
    offered: packages.length,
    excludedAiPackages: rows.length - packages.length,
  });
  return packages;
}

/** §4.2 — one structured-output call over the compact profile. */
async function planLineup(
  libraryContext: string,
  existingPackages: ExistingPackage[],
  maxOutputTokens?: number,
): Promise<LineupPlanDraft> {
  "use step";
  let plan: LineupPlanDraft;
  const trace = traceContext();
  try {
    // #28 — cooperative cancel: aborts this (long) planner call if the run is stopped mid-flight.
    plan = await withRunCancellation((abortSignal) =>
      planLineupService(prisma, libraryContext, { existingPackages, trace, maxOutputTokens, abortSignal }),
    );
  } catch (err) {
    // #29: a DETERMINISTIC plan failure (no valid object — bad shape or token overflow) fails identically
    // on retry. Re-throw as FatalError so the run is marked terminally `failed` immediately, instead of
    // burning the retry budget and (the actual bug) staying re-deliverable so a container restart re-runs
    // it days later and wipe-rebuilds with stale args. A transient failure propagates unchanged and retries.
    // The service tags it (packages/api can't import the Workflow SDK); we translate it here.
    if (err instanceof PlanFatalError) throw new FatalError(err.message);
    throw err;
  }
  const channels = plan.packages.reduce((n, p) => n + p.channels.length, 0);
  const reused = plan.packages.filter((p) => p.existingKey).length;
  console.log(
    `[lineup] plan: ${plan.packages.length} packages (${reused} reused), ${channels} channels`,
  );
  return plan;
}
// The planner is ONE big, expensive call. A deterministic failure is already made terminal above (FatalError,
// no retry); this caps a TRANSIENT failure to a single retry (2 attempts total) rather than the default 3, so
// a flaky provider can't quietly run the priciest call in the workflow four times. (#29)
planLineup.maxRetries = 1;

/** Resolve every channel's number against live state — see `assignChannelNumbers`. */
async function assignNumbers(
  draft: LineupPlanDraft,
  packageIds: Record<string, string>,
): Promise<LineupPlan> {
  "use step";
  const startedAt = new Date();
  const plan = await assignChannelNumbers(prisma, draft, packageIds);
  console.log(`[lineup] numbering:\n${formatLineupPlan(plan)}`);
  await tracePhase(startedAt, "assignNumbers", "numbering", {
    packages: plan.packages.length,
    channels: plan.packages.reduce((n, p) => n + p.channels.length, 0),
  });
  return plan;
}

/**
 * Wipe any previous AI-built lineup, then create this run's packages (all stamped
 * `aiGenerated`). Returns plan-key -> real packageId for the channel builders.
 *
 * The wipe is scoped to `aiGenerated` rows ONLY — manual channels and the preset
 * generator's `generated` rows are untouched (§5). It's destructive by design: re-runs
 * are wipe-and-rebuild, which is why the admin action must confirm first.
 */
async function createPackages(plan: LineupPlanDraft, dryRun: boolean): Promise<Record<string, string>> {
  "use step";
  const startedAt = new Date();
  // DRY RUN: the load-bearing safety gate. Do NOT wipe the existing AI lineup and do NOT create packages —
  // return placeholder ids so the per-channel verify step still runs. Nothing is persisted. (#22)
  if (dryRun) {
    const ids: Record<string, string> = {};
    for (const pkg of plan.packages) ids[pkg.key] = `dry-run:${pkg.key}`;
    console.log(`[lineup] createPackages: DRY RUN — ${plan.packages.length} packages NOT created (existing lineup untouched)`);
    await tracePhase(startedAt, "createPackages", "packages", { dryRun: true, packages: plan.packages.length });
    return ids;
  }
  const cleared = await clearAiGenerated(prisma, "both");
  if (cleared.channelsDeleted || cleared.packagesDeleted) {
    console.log(`[lineup] cleared previous AI lineup: ${cleared.channelsDeleted} channels, ${cleared.packagesDeleted} packages`);
  }

  const ids: Record<string, string> = {};
  let created = 0;
  let reused = 0;

  for (const pkg of plan.packages) {
    // Reuse takes effect only if the package still exists AFTER the wipe. A planner that
    // picked a previous run's `ai` package would otherwise point at a deleted row — so the
    // lookup happens here, post-clear, and silently falls back to creating a new one.
    if (pkg.existingKey) {
      const match = await prisma.channelPackage.findUnique({
        where: { key: pkg.existingKey },
        select: { id: true, name: true },
      });
      if (match) {
        ids[pkg.key] = match.id;
        reused++;
        console.log(`[lineup] package "${pkg.name}" -> reusing existing "${match.name}" (${pkg.existingKey})`);
        continue;
      }
      console.warn(`[lineup] package "${pkg.name}": existingKey "${pkg.existingKey}" not found — creating new`);
    }

    const made = await createPackage(prisma, {
      name: pkg.name,
      description: pkg.description,
      icon: pkg.icon,
      tint: pkg.accent,
    });
    ids[pkg.key] = made.id;
    created++;
  }

  console.log(`[lineup] createPackages: ${created} created, ${reused} reused`);
  await tracePhase(startedAt, "createPackages", "packages", { created, reused, cleared });
  return ids;
}

/**
 * §4.4 — ground the filter (discover_field_values + preview_filter), verify the pool
 * matches the theme, create the channel, then give it a WINDOWED initial schedule so
 * it's watchable the moment the run finishes (v0.5.20) rather than waiting on backfill.
 *
 * Each channel is its own durable step, so a crash resumes only the unfinished ones.
 */
async function buildChannel(
  channel: PlannedChannel,
  packageId: string,
  sourceId: string,
  userId: string,
  libraryContext: string,
  mode: "quality" | "fast",
  dryRun: boolean,
): Promise<ChannelBuildResult> {
  "use step";
  const trace = traceContext();
  // #28 — cooperative cancel: aborts this build's agent loop if the run is stopped mid-flight.
  const result = await withRunCancellation((abortSignal) =>
    buildPlannedChannel(prisma, {
      channel,
      packageId,
      mediaSourceId: sourceId,
      userId,
      libraryContext,
      mode,
      dryRun,
      trace,
      abortSignal,
    }),
  );

  // Dry run: the channel was verified but never persisted, so there's nothing to schedule.
  if (dryRun) {
    console.log(`[lineup] ${channel.number} ${channel.name}: DRY RUN — ${result.status} (pool ${result.poolSize ?? 0}), not created`);
    return result;
  }

  if (result.status === "created" && result.channelId) {
    // A full build would lay this channel's ENTIRE pool (potentially ~300 days); the
    // window keeps it to ~12h so 50 channels don't take hours. schedule-refresh grows
    // each one from its stored cursor.
    try {
      const summary = await generateChannelSchedule(prisma, result.channelId, {
        windowSeconds: INITIAL_WINDOW_SECONDS,
      });
      console.log(
        `[lineup] ${channel.number} ${channel.name}: created (pool ${result.poolSize}) + ${summary.itemCount} slots`,
      );
    } catch (err) {
      // The channel is real and correct; only its initial timeline failed. Leave it —
      // schedule-backfill picks up any enabled channel with no schedule.
      console.warn(`[lineup] ${channel.name}: schedule build failed (backfill will retry):`, err);
    }
  } else {
    console.log(`[lineup] ${channel.number} ${channel.name}: ${result.status} — ${result.reason ?? ""}`);
  }

  return result;
}

/**
 * APPLY (#32) — create a channel from the filter a dry run already COMMITTED, with NO agent loop.
 *
 * The dry run did the expensive verification; applying it just persists that outcome. Mirrors `buildChannel`'s
 * tail (create + windowed schedule + trace) but skips the ~40k-token agent entirely. The unique
 * `Channel.number` is the idempotency claim: a workflow-replay re-dispatch loses the create and returns the
 * existing channel rather than duplicating it.
 */
async function materializeChannel(
  channel: PlannedChannel,
  packageId: string,
  outcome: SeedOutcome | undefined,
  userId: string,
  sourceId: string,
): Promise<ChannelBuildResult> {
  "use step";
  const startedAt = new Date();
  const trace = traceContext();
  const base = { key: channel.key, name: channel.name, number: channel.number };
  const traceBase = {
    ...trace,
    stepName: "materializeChannel",
    phase: "build" as const,
    channelKey: channel.key,
    channelNumber: channel.number,
    channelName: channel.name,
    startedAt,
  };

  // The dry run skipped this channel (give_up / too small) or produced no committed filter — nothing to build.
  if (!outcome?.wouldCreate || outcome.committedFilter == null) {
    const reason = outcome?.reason ?? "The dry run did not produce a buildable channel.";
    await recordTrace(prisma, { ...traceBase, status: "skipped", reason, output: { status: "skipped" } });
    return { ...base, status: "skipped", reason };
  }

  let channelId: string;
  try {
    const made = await createChannel(prisma, userId, {
      mediaSourceId: sourceId,
      name: channel.name,
      number: channel.number,
      packageId,
      description: channel.description,
      callsign: channel.callsign,
      icon: channel.icon,
      tint: channel.accent,
      ordering: channel.ordering,
      sortField: channel.sortField ?? undefined,
      sortDir: channel.sortDir ?? undefined,
      mediaTypes: (outcome.committedMediaTypes ?? channel.mediaTypes) as ("movie" | "show")[],
      filter: outcome.committedFilter as never,
      enabled: true,
    });
    channelId = made.id;
  } catch {
    // Lost a replay race — the number is claimed by the first execution. Return that one, don't duplicate.
    const existing = await prisma.channel.findUnique({ where: { number: channel.number }, select: { id: true } });
    if (existing) {
      return { ...base, status: "created", channelId: existing.id, reason: "Already materialized (duplicate suppressed)." };
    }
    throw new Error(`Could not create channel ${channel.number}`);
  }

  // Windowed initial schedule so it's watchable immediately (same as buildChannel).
  try {
    await generateChannelSchedule(prisma, channelId, { windowSeconds: INITIAL_WINDOW_SECONDS });
  } catch (err) {
    console.warn(`[lineup] ${channel.name}: schedule build failed (backfill will retry):`, err);
  }
  console.log(`[lineup] ${channel.number} ${channel.name}: materialized from dry run (pool ${outcome.poolSize ?? "?"})`);
  await recordTrace(prisma, {
    ...traceBase,
    status: "ok",
    reason: "Materialized from the dry run's verified filter (no AI).",
    output: { status: "created", poolSize: outcome.poolSize, channelId },
  });
  return { ...base, status: "created", channelId, poolSize: outcome.poolSize };
}

/** §4.5 — summarize what was built. */
async function reportLineup(
  sourceId: string,
  plan: LineupPlan,
  built: ChannelBuildResult[],
  dryRun: boolean,
): Promise<LineupReport> {
  "use step";
  const startedAt = new Date();
  const usage = built.reduce(
    (acc, b) => {
      if (!b.usage) return acc;
      return {
        inputTokens: acc.inputTokens + b.usage.inputTokens,
        outputTokens: acc.outputTokens + b.usage.outputTokens,
        cacheReadTokens: acc.cacheReadTokens + b.usage.cacheReadTokens,
        cacheWriteTokens: acc.cacheWriteTokens + b.usage.cacheWriteTokens,
        steps: acc.steps + b.usage.steps,
        channelsWithUsage: acc.channelsWithUsage + 1,
      };
    },
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, steps: 0, channelsWithUsage: 0 },
  );

  const report: LineupReport = {
    sourceId,
    dryRun,
    packagesCreated: dryRun ? 0 : plan.packages.length,
    // The planner always plans the FULL lineup; a testing cap limits only what gets built.
    // Surfacing both makes that gap explicit instead of looking like a shortfall.
    channelsPlanned: plan.packages.reduce((n, p) => n + p.channels.length, 0),
    channelsCreated: built.filter((b) => b.status === "created").length,
    skipped: built.filter((b) => b.status === "skipped"),
    failed: built.filter((b) => b.status === "failed"),
    usage,
  };
  console.log(
    `[lineup] report: ${report.channelsCreated} created, ${report.skipped.length} skipped, ${report.failed.length} failed · ` +
      `tokens in=${usage.inputTokens.toLocaleString()} (cacheRead ${usage.cacheReadTokens.toLocaleString()}, ` +
      `cacheWrite ${usage.cacheWriteTokens.toLocaleString()}) ` +
      `out=${usage.outputTokens.toLocaleString()} over ${usage.steps} steps in ${usage.channelsWithUsage} builds`,
  );
  await tracePhase(startedAt, "reportLineup", "report", {
    packagesCreated: report.packagesCreated,
    channelsPlanned: report.channelsPlanned,
    channelsCreated: report.channelsCreated,
    skipped: report.skipped.length,
    failed: report.failed.length,
    dryRun,
  });
  return report;
}
