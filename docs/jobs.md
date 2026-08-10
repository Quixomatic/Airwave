# Background jobs

> Airwave's in-process cron system: a small registry that runs maintenance tasks (metadata sync, schedule top-ups, cleanup) on a schedule or on demand, with the catalog and the runtime living entirely inside the API server.

## Overview

Airwave runs recurring server-side work — refreshing the metadata cache, topping up channel schedules, pruning old slots, reaping dead watch sessions — through a lightweight background-job system. It is deliberately simple: **[`node-schedule`](https://www.npmjs.com/package/node-schedule) running in-process, single-instance, no Redis / no queue / no external worker service.**

This follows the pattern used by [Overseerr/Jellyseerr](https://github.com/sct/overseerr) ("seerr"), which was the reference while this was designed. The rationale (recorded in the master plan, §8 "Job/cron runner — DECIDED (v0.1.9)"):

- **Airwave is always a self-hosted single box.** There is one API process; there is no horizontal scaling story to design around. A queue/broker exists to coordinate many workers — capacity Airwave doesn't have and doesn't want to require a self-hoster to run.
- **The jobs are coarse and idempotent.** They iterate enabled sources/channels and top up or reconcile state. Running one twice is harmless; missing one run is caught by the next. That tolerance is what makes an in-process scheduler safe.
- **Simplicity for self-hosters.** No Redis, BullMQ, or trigger.dev to stand up. The whole system is a `Map` in memory plus one small database table.

**Single-instance caveat.** Because the registry is an in-memory `Map` rebuilt on each boot, this system assumes exactly one server process. Running two API instances against the same database would run every cron twice — there is no cross-process lock. If Airwave ever needs to scale out, this is the piece that has to change.

**Not to be confused with Workflows.** The two genuinely long-running, must-survive-a-restart operations — the **AI lineup build** and content **import** — do *not* run inside this system. They run on the durable Workflow SDK engine (opt-in via `WORKFLOW_ENABLED=1`). A background *job* here can only *dispatch* such work and return immediately; see [Gotchas](#gotchas--notes) and `docs/workflows.md`.

## How it works

Three pieces, plus one database table:

| Piece | File |
|---|---|
| Job catalog (`JOB_DEFINITIONS`) | `packages/api/src/services/jobs/definitions.ts` |
| Runtime (registry, scheduler, run/cancel) | `packages/api/src/services/jobs/scheduler.ts` |
| tRPC surface (`list` / `run` / `cancel` / `setSchedule`) | `packages/api/src/routers/jobs.ts` |
| Persistent state (`Job` model) | `packages/db/prisma/schema/job.prisma` |
| Admin UI (Settings → Jobs) | `apps/web/src/routes/_auth/settings/jobs.tsx` |

### The registry

The scheduler keeps a module-level `Map<string, LiveJob>` named `live` (`scheduler.ts`). A `LiveJob` bundles the static definition, the live `node-schedule` handle (or `null` for manual jobs), the current cron string, a `running` flag, an optional `AbortController`, and the latest `progress` value:

```ts
type LiveJob = {
  def: JobDefinition;
  job: schedule.Job | null; // null for manual jobs (run-now only)
  cronSchedule: string;
  running: boolean;
  controller?: AbortController;
  progress: JobProgress | null;
};
```

### Boot: `startJobs()`

Called once at server startup (`apps/server/src/index.ts`). It clears the registry, then for **every** definition in `JOB_DEFINITIONS`:

1. **`prisma.job.upsert`** — ensures a `Job` row exists, seeding `cronSchedule` from the definition's `defaultCron` on first boot. Existing rows are left as-is (so a self-hoster's edited cron survives restarts).
2. If the job is **not** `manual`, registers it with `schedule.scheduleJob(row.cronSchedule, …)` — the callback just calls `runJob(def.id)`. An invalid cron logs an error and skips that job. Manual jobs get `job: null` and are never armed.
3. Stores the `LiveJob` in `live`.

So on restart, the schedule is rebuilt from the persisted cron in the DB, not from the code defaults — code only supplies the default for a job the DB has never seen.

### The run path: `runJob(id)`

`runJob` is used for **both** the scheduled tick and the manual "Run now" button — there is one code path.

- **Self-overlap guard:** the very first line is `if (!l || l.running) return;`. A job already running is a **no-op** — it is *skipped, not queued*. If a nightly metadata sync overruns into the next tick, the second tick simply doesn't fire.
- Creates an `AbortController`, sets `running = true`, stashes the controller, clears `progress`, and stamps `lastRunAt` in the DB.
- Awaits `l.def.run(controller.signal, { progress })`, passing the abort signal and a progress callback that writes into `l.progress`.
- On success: writes `lastFinishedAt`, `lastStatus: "success"`, clears `lastError`.
- On throw: logs, writes `lastFinishedAt`, `lastStatus: "failed"`, and the error message to `lastError`.
- `finally`: clears `running`, the controller, and `progress`.

All the DB writes are `.catch(() => {})` — bookkeeping failures never crash the job.

### Cancellation: `cancelJob(id)`

Cooperative, via `AbortSignal`. `cancelJob` just calls `l.controller?.abort()`. It does **not** forcibly kill anything — each job's `run` is responsible for checking `signal.aborted` between units of work and bailing out. The shared helper in `definitions.ts` is:

```ts
const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new Error("Job canceled");
};
```

Most jobs call this at the top of each loop iteration (per source, per channel, …), so Cancel takes effect at the next boundary rather than instantly.

### Progress reporting

A job may call `ctx.progress({ current, total, label })`. The scheduler stores only the latest value in `l.progress` (in memory); `listJobs` returns it so the admin UI can render a live progress bar. `total: 0` is treated as indeterminate (the UI shows a pulsing bar). Batched schedule jobs report `current`/`total` across the batch and use the channel name as the `label`.

### Rescheduling: `setJobSchedule(id, cron)`

Validates and re-arms. It calls node-schedule's `rescheduleJob`, which returns `null` on an invalid cron (the function then returns `false` without persisting). On success it updates the in-memory `cronSchedule` and persists it to the `Job` row. Manual jobs (`job: null`) return `false` — they have no schedule to change.

### `listJobs()`

Joins `JOB_DEFINITIONS` (static: id, name, description, interval, manual flag, `detailHref`) with the live registry (`running`, `progress`, `nextRunAt` via `job.nextInvocation()`, effective cron) and the `Job` row (`lastRunAt`, `lastFinishedAt`, `lastStatus`). This is the single read model the admin page renders.

### Persistent state — the `Job` model

`packages/db/prisma/schema/job.prisma` (table `job`). Deliberately thin — only what must outlive a process:

| Column | Meaning |
|---|---|
| `id` | Stable slug, e.g. `"metadata-sync"` (matches the definition `id`) |
| `cronSchedule` | The editable node-schedule cron expression |
| `enabled` | Boolean, default `true` |
| `lastRunAt` | When the last run started |
| `lastFinishedAt` | When it finished (success or fail) |
| `lastStatus` | `"success"` \| `"failed"` |
| `lastError` | Error message from the last failed run |
| `createdAt` / `updatedAt` | Standard timestamps |

Note what is **not** persisted: the `running` flag, the `AbortController`, and live `progress` are all in-memory only. A server restart mid-run loses that a job was running (it just won't have a `lastFinishedAt` for that attempt).

**Cron format** is node-schedule's 6-field, seconds-first form: `sec min hour dom mon dow`. E.g. `0 0 3 * * *` = daily at 03:00; `0 */5 * * * *` = every 5 minutes.

## The job catalog

Everything below comes from `JOB_DEFINITIONS` in `definitions.ts`. There are **15** jobs: **11 auto** (cron-scheduled) and **4 manual** (`manual: true`, `interval: "fixed"`, run-now only — their `defaultCron` of `0 0 0 1 1 *` is a placeholder that never fires because they are never armed).

### Auto (scheduled)

| Name (id) | Default cadence | What it does |
|---|---|---|
| **Metadata Sync** (`metadata-sync`) | Daily 03:00 (`0 0 3 * * *`) | Full refresh of the metadata cache for every enabled source (`syncMediaItems`): pages all movies/episodes, links episodes to their show, and flags anything no longer on the server as unavailable (removal detection). Reports progress. |
| **Recently Added Scan** (`recently-added-scan`) | Every 5 min (`0 */5 * * * *`) | Cheap incremental pull of only the most-recently-added items per library (`syncRecentlyAdded`), so new content appears in guides within minutes. Does not detect removals. |
| **Library Scan** (`library-scan`) | Daily 04:00 (`0 0 4 * * *`) | Re-reads each source's list of libraries/sections (`syncLibraries`), picking up added/removed libraries while preserving enabled/disabled choices. |
| **Schedule Refresh** (`schedule-refresh`) | Hourly (`0 0 * * * *`) | For each enabled channel, `extendChannelSchedule` — appends fresh programming at the tail *only when the timeline is running low*. Self-adjusting; no-ops on a channel with no schedule yet (that's backfill's job). |
| **Schedule Backfill** (`schedule-backfill`) | Every 10 min (`0 */10 * * * *`) | Builds the *initial* schedule for enabled channels that have none (`scheduleItems: none`), in batches of **25**, with progress; idles once every channel is scheduled. Picks up freshly auto-generated channels. |
| **Bumper Sync** (`schedule-bumper-sync`) | Every 10 min (`0 */10 * * * *`) | Reconciles existing schedules with current bumper settings in batches of **10**. A channel is stale when bumper *presence* differs from what's expected, or presence is right but its `bumperRev` is behind the global `BumperConfig.rev` (catches any settings change). Only touches channels that already have a schedule. |
| **Schedule Prune** (`schedule-prune`) | Daily 02:00 (`0 0 2 * * *`) | Deletes schedule slots that have already aired, past a **6-hour** safety buffer (so a long item that's still playing is never cut), to keep the `schedule_item` table lean. |
| **Missing Media Repair** (`schedule-missing-media-repair`) | Hourly at :30 (`0 30 * * * *`) | For enabled channels whose upcoming schedule points at now-unavailable media (flagged by metadata sync), splice-repairs the timeline from the first bad slot (`repairChannelSchedule`), in batches of **10**. Cheap no-op when nothing's broken; offset to :30 to avoid the other schedule jobs. |
| **Watch Session Reaper** (`watch-session-reap`) | Every 2 min (`0 */2 * * * *`) | Clears stale `WatchSession` rows (no heartbeat for ~1 min, e.g. a closed tab) and stops any Plex transcode they left running (`stopTranscode`), so zombie transcode sessions don't pile up. |
| **Plex Token Check** (`plex-token-check`) | Daily 05:00 (`0 0 5 * * *`) | Verifies each source's owner token still works (`getPlexUser`); logs a warning if it's been revoked, so a broken connection is caught early. |
| **Plex Connection Refresh** (`plex-connection-refresh`) | Hourly (`0 0 * * * *`) | Refreshes each source's LAN/remote/relay connection URLs from plex.tv (`resolveConnectionUrls` → `mediaSource.remoteUrl`/`relayUrl`), so clients can reach the server even as its WAN IP changes. |

### Manual (run-now only)

| Name (id) | What it does |
|---|---|
| **Auto-Generate Lineup** (`lineup-generate`) | `generateLineup(scope: "all")` for each enabled source: evaluates the preset catalog against the library and creates the channels it can fill. Triggered from the Channels page's Auto-generate button. |
| **Build Lineup with AI** (`ai-lineup-build`) | **Dispatcher only.** Kicks off the durable AI-lineup Workflow (`getLineupRunner().start(...)`) and returns a `runId` immediately — it does *not* wait for the multi-hour build. Destructive: the workflow clears the existing AI lineup first. Requires `WORKFLOW_ENABLED=1` and configured planner + worker AI connections, else it throws. `detailHref` links to `/settings/workflows/ai-lineup`. See `docs/workflows.md`. |
| **Clear AI Lineup** (`ai-lineup-clear`) | Deletes every AI-generated channel and package (`clearAiGenerated`, the 1000+ block); leaves preset-generated and hand-made channels untouched. |
| **Scan Bumper Music** (`bumper-music-scan`) | Scans the bumper-music volume for audio dropped in directly (`scanMusicDir`): indexes new tracks into the rotation, flags missing files, un-flags any that reappeared. Run after adding files to the music volume. |

## Running & configuring jobs

The admin UI lives at **Settings → Jobs** (`apps/web/src/routes/_auth/settings/jobs.tsx`). It polls `jobs.list` every 5 s (1.5 s while any job is running, so progress bars stay live).

Each row shows: the name and one-line description; an **Auto** / **Manual** badge (Manual = `interval: "fixed"`); a "running" spinner or a "last run failed" note; the human-readable cadence (via `cronstrue`) and next-run time; and the last successful finish. Dispatcher jobs with a `detailHref` (the AI build) also render a "View runs & cost" link, because their real status lives in the Workflow tables, not here.

Controls, mapping to the tRPC router (`routers/jobs.ts`, all `adminProcedure`):

- **Run now** → `jobs.run({ id })` → `runJob` (fire-and-forget; the mutation returns immediately, status is polled via `list`). Running a job manually never changes its schedule.
- **Cancel** (shown while running) → `jobs.cancel({ id })` → `cancelJob` (aborts the signal).
- **Edit schedule** (pencil; disabled for manual jobs) → an "every N minutes/hours/days" modal that builds a 6-field cron via `buildCron` and saves through `jobs.setSchedule({ id, schedule })` → `setJobSchedule`. The modal only offers interval presets per the job's `interval` type; it doesn't accept a raw cron string.

Some jobs are also triggered programmatically as fire-and-forget from elsewhere in the app rather than only from this page — e.g. the source page's "Sync metadata" button runs `metadata-sync`, and a bumper-settings save kicks `schedule-bumper-sync` immediately so repairs don't wait for the next cron tick.

## Gotchas & notes

- **The self-overlap guard is per-process, per-job only.** `if (l.running) return` prevents a single job from overlapping itself *within one server process*. It is not a distributed lock — two API instances on the same database would each run every cron. This system assumes exactly one server.
- **Skipped, not queued.** An overlapping tick is dropped, never deferred. That's fine because the jobs are idempotent top-ups — the next tick catches up.
- **Cancel is cooperative.** `cancelJob` only sets the abort flag. A job that never checks `signal.aborted` (or is stuck in a single long call) won't stop until that call returns. Jobs check the flag *between* units of work, so cancellation is bounded by one unit, not instant.
- **Batched jobs process a slice per run and idle when caught up.** `schedule-backfill` (25/run), `schedule-bumper-sync` (10/run), and `schedule-missing-media-repair` (10/run) intentionally do a bounded amount of work each tick and rely on the frequent cron to drain the backlog over several runs. A large fresh lineup becomes watchable over a few minutes, not in a single pass.
- **`ai-lineup-build` "success" means *dispatched*, not *finished*.** The Job table can't represent a multi-hour run — its state is in-memory and `runJob` `await`s the function, which here returns as soon as the workflow is started. The Jobs row will read success once the dispatch succeeds; real progress and cost live on the AI Lineup / Workflows page. This is the core reason durable work is a Workflow, not a Job — see `docs/workflows.md`.
- **Manual jobs' `defaultCron` is a decoy.** They carry `0 0 0 1 1 *` (midnight, Jan 1) but are never armed because `manual: true` skips `scheduleJob`. The value only exists to satisfy the `Job` row's non-null `cronSchedule`.
- **DB bookkeeping is best-effort.** Every `prisma.job.update` in `runJob` is wrapped in `.catch(() => {})`; a database hiccup won't fail an otherwise-successful job, but it can leave `lastStatus`/`lastFinishedAt` momentarily stale.
- **Adding a job:** append a `JobDefinition` to `JOB_DEFINITIONS` with a `run(signal, ctx)` that wraps a service function and checks `signal.aborted` between units of work. On next boot `startJobs()` seeds its `Job` row and it becomes listable, runnable, cancellable, and (if not manual) reschedulable — no other wiring. Keep business logic in `packages/api/src/services/<domain>/`, not in the definition.
