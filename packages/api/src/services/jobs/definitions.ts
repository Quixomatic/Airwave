import prisma from "@ChannelGuide/db";

import { extendChannelSchedule } from "../schedule/generate";
import { syncMediaItems } from "../media/sync-media";
import { syncLibraries } from "../plex/sync-libraries";

export type JobInterval = "seconds" | "minutes" | "hours" | "days" | "fixed";

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
  run: (signal: AbortSignal) => Promise<void>;
};

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new Error("Job canceled");
};

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    id: "metadata-sync",
    name: "Metadata Sync",
    interval: "hours",
    // every day at 03:00
    defaultCron: "0 0 3 * * *",
    run: async (signal) => {
      const sources = await prisma.mediaSource.findMany({
        where: { enabled: true },
        select: { id: true },
      });
      for (const source of sources) {
        throwIfAborted(signal);
        await syncMediaItems(prisma, source.id);
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
      const sources = await prisma.mediaSource.findMany({ where: { enabled: true } });
      for (const source of sources) {
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
];

export const jobDefinition = (id: string): JobDefinition | undefined =>
  JOB_DEFINITIONS.find((d) => d.id === id);
