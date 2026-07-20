import prisma from "@ChannelGuide/db";

import type { SyncProgress } from "../media/media-item";
import { getLineupRunner } from "../agent/lineup-runner";
import { clearAiGenerated } from "../agent/tools";
import { getGlobalBumperConfig } from "../bumpers/bumper-config";
import { generateLineup } from "../generator/generate";
import { syncMediaItems } from "../media/sync-media";
import { syncRecentlyAdded } from "../media/sync-recent";
import { getPlexUser, stopTranscode } from "../plex/client";
import { syncLibraries } from "../plex/sync-libraries";
import {
  INITIAL_WINDOW_SECONDS,
  extendChannelSchedule,
  generateChannelSchedule,
  repairChannelSchedule,
} from "../schedule/generate";

export type JobInterval = "seconds" | "minutes" | "hours" | "days" | "fixed";

/** Passed to a job's `run` so it can report live progress to the scheduler. */
export type JobContext = { progress: SyncProgress };

/**
 * A background job definition. The name, cadence, and the work live in code; the
 * editable cron schedule + last-run bookkeeping live in the `Job` table. `run`
 * should check `signal.aborted` between units of work so Cancel is cooperative.
 */
export type JobDefinition = {
  id: string;
  name: string;
  /** One-line, human-readable explanation of what the job does (shown on the Jobs page). */
  description: string;
  interval: JobInterval;
  defaultCron: string;
  /** Manual jobs are never auto-scheduled — run-now only (e.g. lineup generation). */
  manual?: boolean;
  run: (signal: AbortSignal, ctx: JobContext) => Promise<void>;
};

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new Error("Job canceled");
};

const enabledSources = () =>
  prisma.mediaSource.findMany({ where: { enabled: true } });

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    id: "metadata-sync",
    name: "Metadata Sync",
    description:
      "Full refresh of the metadata cache from every connected source — pages all movies and episodes, links episodes to their shows, and flags anything no longer on the server as unavailable.",
    interval: "hours",
    // full refresh + removal detection — every day at 03:00
    defaultCron: "0 0 3 * * *",
    run: async (signal, ctx) => {
      for (const source of await enabledSources()) {
        throwIfAborted(signal);
        await syncMediaItems(prisma, source.id, ctx.progress);
      }
    },
  },
  {
    id: "recently-added-scan",
    name: "Recently Added Scan",
    description:
      "Quick incremental scan that pulls only the most-recently-added items from each library, so new content shows up in guides within minutes without a full resync.",
    interval: "minutes",
    // cheap incremental — every 5 minutes
    defaultCron: "0 */5 * * * *",
    run: async (signal, ctx) => {
      for (const source of await enabledSources()) {
        throwIfAborted(signal);
        await syncRecentlyAdded(prisma, source.id, ctx.progress);
      }
    },
  },
  {
    id: "library-scan",
    name: "Library Scan",
    description:
      "Re-reads each source's list of libraries (sections), picking up newly-added or removed libraries while preserving your enabled/disabled choices.",
    interval: "days",
    // every day at 04:00
    defaultCron: "0 0 4 * * *",
    run: async (signal) => {
      for (const source of await enabledSources()) {
        throwIfAborted(signal);
        await syncLibraries(prisma, source);
      }
    },
  },
  {
    id: "schedule-refresh",
    name: "Schedule Refresh",
    description:
      "Tops up each active channel's timeline when it's running low, appending fresh programming at the tail without disturbing what's currently on.",
    interval: "hours",
    // hourly — tops up any channel whose timeline is running low (self-adjusting)
    defaultCron: "0 0 * * * *",
    run: async (signal) => {
      const channels = await prisma.channel.findMany({
        where: { enabled: true },
        select: { id: true },
      });
      for (const channel of channels) {
        throwIfAborted(signal);
        await extendChannelSchedule(prisma, channel.id);
      }
    },
  },
  {
    id: "schedule-backfill",
    name: "Schedule Backfill",
    description:
      "Builds the initial schedule for active channels that don't have one yet (e.g. freshly auto-generated), a small batch at a time, then idles once every channel is scheduled.",
    interval: "minutes",
    // every 10 min — build initial schedules for enabled channels that have none
    // yet, a small batch at a time (extend/refresh only tops up existing timelines).
    // Idles once every channel has a schedule; picks up newly-generated channels.
    defaultCron: "0 */10 * * * *",
    run: async (signal, ctx) => {
      // Bigger batch than before: a WINDOWED build (~12h) is cheap, where a full build
      // lays a channel's entire pool — for a big channel that's a ~300-day pass and
      // minutes of work. `schedule-refresh` grows these from the stored cursor, so the
      // whole lineup becomes watchable fast instead of 10 channels per 10 minutes.
      const BATCH = 25;
      const channels = await prisma.channel.findMany({
        where: { enabled: true, scheduleItems: { none: {} } },
        select: { id: true, name: true },
        orderBy: { number: "asc" },
        take: BATCH,
      });
      for (let i = 0; i < channels.length; i++) {
        throwIfAborted(signal);
        ctx.progress({ current: i, total: channels.length, label: channels[i]!.name });
        try {
          await generateChannelSchedule(prisma, channels[i]!.id, {
            windowSeconds: INITIAL_WINDOW_SECONDS,
          });
        } catch (err) {
          console.warn(`[jobs] schedule-backfill failed for "${channels[i]!.name}":`, err);
        }
      }
      if (channels.length > 0) {
        console.log(`[jobs] schedule-backfill built ${channels.length} schedule(s)`);
      }
    },
  },
  {
    id: "schedule-bumper-sync",
    name: "Bumper Sync",
    description:
      "Reconciles existing schedules with the current bumper settings — when bumpers are toggled on/off (globally or per channel) or the interstitial break length changes, rebuilds the affected channels a small batch at a time so their timelines match, then idles.",
    interval: "minutes",
    // every 10 min — reconcile a batch of channels whose bumper presence is stale.
    defaultCron: "0 */10 * * * *",
    run: async (signal, ctx) => {
      const BATCH = 10;
      const global = await getGlobalBumperConfig(prisma);
      // Only channels that already have a schedule (the initial build is backfill's job).
      const channels = await prisma.channel.findMany({
        where: { enabled: true, scheduleItems: { some: {} } },
        select: { id: true, name: true, bumperMode: true, bumperRev: true },
        orderBy: { number: "asc" },
      });
      const withBumpers = new Set(
        (
          await prisma.scheduleItem.findMany({
            where: { kind: "BUMPER" },
            distinct: ["channelId"],
            select: { channelId: true },
          })
        ).map((r) => r.channelId),
      );

      // Out of sync when either (a) whether bumpers *should* be present differs from
      // whether they are (toggled on/off, mode changed), or (b) they're present as they
      // should be but the channel was last built under an older config rev — which
      // catches ANY settings change (break-length tiers, threshold, style, …).
      const stale = channels
        .filter((c) => {
          const shouldHave = global.enabled && c.bumperMode !== "OFF";
          if (shouldHave !== withBumpers.has(c.id)) return true;
          return shouldHave && c.bumperRev !== global.rev;
        })
        .slice(0, BATCH);

      for (let i = 0; i < stale.length; i++) {
        throwIfAborted(signal);
        ctx.progress({ current: i, total: stale.length, label: stale[i]!.name });
        try {
          await generateChannelSchedule(prisma, stale[i]!.id);
        } catch (err) {
          console.warn(`[jobs] schedule-bumper-sync failed for "${stale[i]!.name}":`, err);
        }
      }
      if (stale.length > 0) {
        console.log(`[jobs] schedule-bumper-sync reconciled ${stale.length} channel(s)`);
      }
    },
  },
  {
    id: "ai-lineup-clear",
    name: "Clear AI Lineup",
    description:
      "Deletes every AI-generated channel and package (the 1000+ block). Manual; leaves preset-generated and hand-made channels completely untouched.",
    interval: "fixed",
    defaultCron: "0 0 0 1 1 *", // manual-only; never auto-fires
    manual: true,
    run: async () => {
      const { channelsDeleted, packagesDeleted } = await clearAiGenerated(prisma, "both");
      console.log(`[jobs] ai-lineup-clear removed ${channelsDeleted} channel(s), ${packagesDeleted} package(s)`);
    },
  },
  {
    id: "ai-lineup-build",
    name: "Build Lineup with AI",
    description:
      "Analyses your library and builds the whole AI lineup (packages + channels + schedules). DESTRUCTIVE: clears the existing AI lineup first. Runs as a durable background workflow — this job only kicks it off and returns; watch progress in the workflow UI.",
    interval: "fixed",
    defaultCron: "0 0 0 1 1 *", // manual-only; never auto-fires
    manual: true,
    run: async () => {
      // DISPATCHER ONLY. The real work is a durable workflow that outlives this call and
      // survives restarts — `start()` returns a runId immediately. So this job's status
      // means "kicked off", NOT "finished"; the Job table can't represent a multi-hour run
      // (its state is in-memory and `runJob` awaits the function). See §3 of the plan.
      const runner = getLineupRunner();
      if (!runner) throw new Error("Workflow engine isn't running — set WORKFLOW_ENABLED=1 and restart the server.");

      const source = (await enabledSources())[0];
      if (!source) throw new Error("No enabled media source.");
      const admin = await prisma.user.findFirst({ where: { role: "admin" }, orderBy: { createdAt: "asc" }, select: { id: true } });
      if (!admin) throw new Error("No admin user found.");

      const { runId } = await runner.start({ sourceId: source.id, userId: admin.id });
      console.log(`[jobs] ai-lineup-build dispatched run ${runId}`);
    },
  },
  {
    id: "lineup-generate",
    name: "Auto-Generate Lineup",
    description:
      "Auto-generates the full channel lineup from the preset catalog — evaluates each preset against your library and creates the channels it can fill. Manual; run it from the Channels page.",
    interval: "fixed",
    defaultCron: "0 0 0 1 1 *", // manual-only; never auto-fires
    manual: true,
    run: async (signal, ctx) => {
      for (const source of await enabledSources()) {
        throwIfAborted(signal);
        await generateLineup(prisma, source.id, { scope: "all", onProgress: ctx.progress });
      }
    },
  },
  {
    id: "schedule-prune",
    name: "Schedule Prune",
    description:
      "Removes schedule slots that have already aired (past a safety buffer) to keep the timeline table lean.",
    interval: "days",
    // every day at 02:00 — drop schedule slots that have already passed
    defaultCron: "0 0 2 * * *",
    run: async () => {
      // Keep a safety buffer past "a couple hours" to never cut a currently-playing
      // long item (a 3h movie that started 2h ago is still on).
      const cutoff = new Date(Date.now() - 6 * 3600 * 1000);
      const { count } = await prisma.scheduleItem.deleteMany({
        where: { startsAt: { lt: cutoff } },
      });
      if (count > 0) console.log(`[jobs] schedule-prune removed ${count} passed slots`);
    },
  },
  {
    id: "schedule-missing-media-repair",
    name: "Missing Media Repair",
    description:
      "When content is removed from the media server (metadata sync flags it unavailable), splices the affected channels' upcoming schedules — re-flows the timeline from the first slot that points at now-gone media, leaving what's on now and the still-valid near-term slots untouched.",
    interval: "hours",
    // hourly at :30 — offset from the other schedule jobs. Removal is detected by the
    // daily metadata sync, so hourly is plenty; the repair itself is a cheap no-op when
    // nothing's broken.
    defaultCron: "0 30 * * * *",
    run: async (signal, ctx) => {
      const BATCH = 10;
      const cutoff = new Date(Date.now() + 5 * 60 * 1000);
      const channels = await prisma.channel.findMany({
        where: {
          enabled: true,
          scheduleItems: {
            some: {
              startsAt: { gte: cutoff },
              OR: [{ mediaItem: { available: false } }, { targetMediaItem: { available: false } }],
            },
          },
        },
        select: { id: true, name: true },
        orderBy: { number: "asc" },
        take: BATCH,
      });
      let repaired = 0;
      for (let i = 0; i < channels.length; i++) {
        throwIfAborted(signal);
        ctx.progress({ current: i, total: channels.length, label: channels[i]!.name });
        try {
          const r = await repairChannelSchedule(prisma, channels[i]!.id);
          if (r.repaired) repaired++;
        } catch (err) {
          console.warn(`[jobs] missing-media-repair failed for "${channels[i]!.name}":`, err);
        }
      }
      if (repaired > 0) console.log(`[jobs] schedule-missing-media-repair spliced ${repaired} channel(s)`);
    },
  },
  {
    id: "watch-session-reap",
    name: "Watch Session Reaper",
    description:
      "Clears stale watch sessions (no heartbeat for ~1 min — e.g. a closed tab) and stops any Plex transcode they left running, so zombie transcode sessions don't pile up.",
    interval: "minutes",
    defaultCron: "0 */2 * * * *",
    run: async (signal) => {
      const cutoff = new Date(Date.now() - 60_000);
      const stale = await prisma.watchSession.findMany({
        where: { lastHeartbeatAt: { lt: cutoff } },
        include: { channel: { include: { mediaSource: true } } },
      });
      for (const s of stale) {
        throwIfAborted(signal);
        const src = s.channel?.mediaSource;
        if (s.transcodeSession && src?.baseUrl) {
          await stopTranscode(
            src.baseUrl,
            src.token,
            src.clientIdentifier ?? "channelguide-server",
            s.transcodeSession,
          );
        }
      }
      if (stale.length > 0) {
        await prisma.watchSession.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
        console.log(`[jobs] watch-session-reap cleared ${stale.length} stale session(s)`);
      }
    },
  },
  {
    id: "plex-token-check",
    name: "Plex Token Check",
    description:
      "Verifies each source's owner token still works and logs a warning if it's been revoked, so a broken connection is caught early.",
    interval: "days",
    // once a day at 05:00 — verify each source's owner token still works
    defaultCron: "0 0 5 * * *",
    run: async (signal) => {
      for (const source of await enabledSources()) {
        throwIfAborted(signal);
        try {
          await getPlexUser(source.clientIdentifier ?? "channelguide-server", source.token);
        } catch {
          console.warn(`[jobs] Plex token check failed for source "${source.name}"`);
        }
      }
    },
  },
];

export const jobDefinition = (id: string): JobDefinition | undefined =>
  JOB_DEFINITIONS.find((d) => d.id === id);
