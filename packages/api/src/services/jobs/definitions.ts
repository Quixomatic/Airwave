import prisma from "@ChannelGuide/db";

import type { SyncProgress } from "../media/media-item";
import { generateLineup } from "../generator/generate";
import { syncMediaItems } from "../media/sync-media";
import { syncRecentlyAdded } from "../media/sync-recent";
import { getPlexUser } from "../plex/client";
import { syncLibraries } from "../plex/sync-libraries";
import { extendChannelSchedule, generateChannelSchedule } from "../schedule/generate";

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
    interval: "minutes",
    // every 10 min — build initial schedules for enabled channels that have none
    // yet, a small batch at a time (extend/refresh only tops up existing timelines).
    // Idles once every channel has a schedule; picks up newly-generated channels.
    defaultCron: "0 */10 * * * *",
    run: async (signal, ctx) => {
      const BATCH = 10;
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
          await generateChannelSchedule(prisma, channels[i]!.id);
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
    id: "lineup-generate",
    name: "Auto-Generate Lineup",
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
    id: "plex-token-check",
    name: "Plex Token Check",
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
