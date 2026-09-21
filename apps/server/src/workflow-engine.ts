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
import prisma from "@airwave/db";
import { setLineupRunner } from "@airwave/api/services/agent/lineup-runner";
import { setPresetRunner } from "@airwave/api/services/generator/preset-runner";
import { setImportRunner } from "@airwave/api/services/transfer/import-runner";
import { getAppSettings } from "@airwave/api/services/settings/index";

import { importLineupWorkflow } from "../workflows/import";
import { aiLineupWorkflow } from "../workflows/lineup";
import { presetWorkflow } from "../workflows/preset";

/** Run statuses that mean a run is over. Anything else is still "live" and could be resumed. */
const TERMINAL_RUN_STATUS = new Set(["completed", "failed", "cancelled", "aborted", "expired"]);

/** Minimal shapes for the pieces of the world storage + observability API this guard uses. */
type Loose = Record<string, unknown>;
type WorldStorage = {
  runs: {
    list: (o: { resolveData?: "all" | "none"; pagination?: { cursor?: string } }) => Promise<{ data: Loose[]; cursor?: string }>;
    get: (runId: string, o?: { resolveData?: "all" | "none" }) => Promise<Loose>;
  };
};

/**
 * #29 — zombie-resume safety. BEFORE the world starts polling, cancel any non-terminal AI-lineup run whose
 * FROZEN config args no longer match the current settings.
 *
 * The bug: a run's args are frozen at dispatch. A run that failed but never reached terminal stays
 * re-deliverable, so a later container restart resumes it — re-running `createPackages` (which WIPES the AI
 * lineup) and rebuilding with the OLD concurrency / token budget from before the admin changed them. The
 * terminal-marking fix (FatalError on deterministic plan failure) stops most of these from lingering; this is
 * the backstop for runs that predate the fix or failed transiently.
 *
 * We read each run's frozen args straight from the SDK via the observability API (no stored hash, no
 * migration — see the probe `scripts/observability-probe.ts`) and compare only the CONFIG-derived fields
 * (concurrency, plannerMaxOutputTokens). Per-run choices (dryRun / limit / sourceId) are intrinsic to the run
 * and are NOT drift. An unchanged-config run is left alone so a legitimate crash-resume still resumes.
 *
 * Best-effort: never blocks engine startup. `world.runs` reads and the cancel work with the world not yet
 * started (the probe confirmed storage reads need no `world.start()`).
 */
async function guardStaleLineupRuns(deps: {
  world: WorldStorage;
  cancelRun: (runId: string) => Promise<void>;
  hydrate: (resource: Loose) => Loose;
}): Promise<void> {
  try {
    const settings = await getAppSettings(prisma);

    // Metadata only, paginated to completion — the SDK returns ~20 rows + a cursor per page, so a single
    // call would silently miss older non-terminal runs (learned running the probe).
    const runs: Loose[] = [];
    let cursor: string | undefined;
    do {
      const page = await deps.world.runs.list({ resolveData: "none", pagination: cursor ? { cursor } : {} });
      runs.push(...page.data);
      cursor = page.cursor;
    } while (cursor);

    const pick = (o: Loose, ...keys: string[]): unknown => {
      for (const k of keys) if (o[k] != null) return o[k];
      return undefined;
    };
    const candidates = runs.filter((r) => {
      const name = String(pick(r, "name", "workflowName") ?? "");
      const status = String(pick(r, "status") ?? "");
      return name.includes("aiLineupWorkflow") && !TERMINAL_RUN_STATUS.has(status);
    });
    if (!candidates.length) {
      console.log("[workflow] startup guard: no non-terminal lineup runs to check");
      return;
    }

    for (const r of candidates) {
      const runId = String(pick(r, "runId", "id"));
      try {
        const full = deps.hydrate(await deps.world.runs.get(runId, { resolveData: "all" }));
        const input = full.input;
        const args = (Array.isArray(input) ? input[0] : input) as Loose | undefined;
        const frozenConcurrency = args?.concurrency;
        const frozenTokens = args?.plannerMaxOutputTokens;
        const drift =
          frozenConcurrency !== settings.channelBuildConcurrency ||
          frozenTokens !== settings.plannerMaxOutputTokens;
        if (!drift) {
          console.log(`[workflow] startup guard: ${runId} config unchanged — allowing resume`);
          continue;
        }
        console.warn(
          `[workflow] startup guard: ${runId} was dispatched with STALE config ` +
            `(concurrency ${String(frozenConcurrency)} -> ${settings.channelBuildConcurrency}, ` +
            `plannerMaxOutputTokens ${String(frozenTokens)} -> ${settings.plannerMaxOutputTokens}) — ` +
            `cancelling so it can't resume and wipe-rebuild with old settings (#29)`,
        );
        await deps.cancelRun(runId);
      } catch (e) {
        console.warn(`[workflow] startup guard: could not inspect/cancel ${runId}:`, e);
      }
    }
  } catch (e) {
    // The guard must never stop the engine from booting.
    console.warn("[workflow] startup guard failed (continuing to start):", e);
  }
}

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
  const [
    { createWorld },
    { start, getRun },
    { setWorld },
    { hydrateResourceIO, observabilityRevivers },
    flow,
    step,
  ] = await Promise.all([
    import("@workflow/world-postgres"),
    import("workflow/api"),
    import("workflow/runtime"),
    import("workflow/observability"),
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

  // ── Lift the 300s step ceiling (self-hosted) ────────────────────────────────────────────────
  // Bun's `fetch()` has a NON-STANDARD default 300s idle watchdog: a request whose connection is
  // idle (no bytes either way) for 300s is aborted. The world dispatches a step by POSTing to our
  // loopback handler with a BARE `fetch()` (world-postgres `queue.ts`) and `await`ing the whole
  // response — during a long step that connection is idle, so at 300s Bun aborts it, the job is
  // re-delivered, and the step "fails" (only succeeding on the warm retry). This is the ONLY thing
  // capping step duration for us: self-hosted has no platform function limit, world-postgres sets
  // no step deadline (`getRuntimeDeadline` unimplemented) and no dispatch timeout of its own — unlike
  // world-vercel, which passes an explicit `AbortSignal.timeout(getRequestTimeoutMs())`.
  //
  // Fix WITHOUT patching node_modules: world-postgres calls the GLOBAL `fetch` at call-time, so wrap
  // it here to pass Bun's `timeout: false` (disables the watchdog) for loopback workflow dispatches
  // ONLY. Every other fetch (Plex, etc.) is untouched and keeps the default. Idempotent via a flag.
  if (!(globalThis as { __wfFetchPatched?: boolean }).__wfFetchPatched) {
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = ((input: unknown, init?: unknown) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : (input as { url?: string })?.url;
      if (typeof url === "string" && url.includes("/.well-known/workflow/")) {
        // `timeout` is a Bun-specific RequestInit extension; not in the DOM types.
        return nativeFetch(input as string, { ...(init as object), timeout: false } as RequestInit);
      }
      return nativeFetch(input as string, init as RequestInit);
    }) as typeof fetch;
    (globalThis as { __wfFetchPatched?: boolean }).__wfFetchPatched = true;
    console.log("[workflow] loopback dispatch fetch: 300s Bun watchdog disabled (steps may run >5m)");
  }

  const world = createWorld();
  // Register the world globally so steps can read run/step data via `getWorld()` (the seed loader for the
  // build-from-dry-run / rebuild flows) without opening a second pg pool per run.
  setWorld(world);

  // #29 — cancel any config-drifted non-terminal lineup run BEFORE the poller can pick it up and
  // resume-and-wipe with stale args. Reads frozen args via the observability API; best-effort. Cancel goes
  // through the same `getRun().cancel()` the runner uses.
  await guardStaleLineupRuns({
    world: world as unknown as WorldStorage,
    cancelRun: async (runId) => {
      const run = await getRun(runId);
      await run?.cancel();
    },
    hydrate: (resource) => hydrateResourceIO(resource as never, observabilityRevivers) as Loose,
  });

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

  setPresetRunner({
    // The WDK run id is returned so the dispatch can store it on `PresetRun.workflowRunId` (for cancel);
    // OUR `args.runId` is the identity everything else reads.
    async start(args) {
      const run = await start(presetWorkflow, [args]);
      console.log(`[workflow] preset run started: WDK ${run.runId} (PresetRun ${args.runId})`);
      return { workflowRunId: run.runId };
    },
    async status(workflowRunId) {
      const run = await getRun(workflowRunId);
      if (!run) return null;
      const status = await run.status;
      const output = status === "completed" ? await run.returnValue : undefined;
      return { runId: workflowRunId, status, output };
    },
    async cancel(workflowRunId) {
      const run = await getRun(workflowRunId);
      await run?.cancel();
    },
  });

  console.log(`[workflow] engine ready (handlers on 127.0.0.1:${workflowPort()}, worker polling)`);
}
