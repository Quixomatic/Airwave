import prisma from "@ChannelGuide/db";
import schedule, { rescheduleJob } from "node-schedule";

import { JOB_DEFINITIONS, type JobDefinition, jobDefinition } from "./definitions";

export type JobProgress = { current: number; total: number; label: string };

type LiveJob = {
  def: JobDefinition;
  job: schedule.Job | null; // null for manual jobs (run-now only, never auto-scheduled)
  cronSchedule: string;
  running: boolean;
  controller?: AbortController;
  progress: JobProgress | null;
};

/** In-memory registry (single-instance). Rebuilt from the DB on each server start. */
const live = new Map<string, LiveJob>();

/** Register every defined job with node-schedule, using the DB's cron (or the default). */
export async function startJobs(): Promise<void> {
  live.clear();
  for (const def of JOB_DEFINITIONS) {
    const row = await prisma.job.upsert({
      where: { id: def.id },
      create: { id: def.id, cronSchedule: def.defaultCron },
      update: {},
    });
    let job: schedule.Job | null = null;
    if (!def.manual) {
      job = schedule.scheduleJob(row.cronSchedule, () => {
        void runJob(def.id);
      });
      if (!job) {
        console.error(`[jobs] invalid cron for "${def.id}": ${row.cronSchedule}`);
        continue;
      }
    }
    live.set(def.id, {
      def,
      job,
      cronSchedule: row.cronSchedule,
      running: false,
      progress: null,
    });
  }
  console.log(`[jobs] scheduled ${live.size} job(s)`);
}

/** Run a job now (also the scheduled callback). No-ops if it's already running. */
export async function runJob(id: string): Promise<void> {
  const l = live.get(id);
  if (!l || l.running) return;

  const controller = new AbortController();
  l.running = true;
  l.controller = controller;
  l.progress = null;
  await prisma.job.update({ where: { id }, data: { lastRunAt: new Date() } }).catch(() => {});

  try {
    await l.def.run(controller.signal, { progress: (p) => (l.progress = p) });
    await prisma.job
      .update({
        where: { id },
        data: { lastFinishedAt: new Date(), lastStatus: "success", lastError: null },
      })
      .catch(() => {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[jobs] "${id}" failed:`, message);
    await prisma.job
      .update({
        where: { id },
        data: { lastFinishedAt: new Date(), lastStatus: "failed", lastError: message },
      })
      .catch(() => {});
  } finally {
    l.running = false;
    l.controller = undefined;
    l.progress = null;
  }
}

/** Cooperatively cancel a running job (its `run` checks `signal.aborted`). */
export function cancelJob(id: string): boolean {
  const l = live.get(id);
  if (!l) return false;
  l.controller?.abort();
  return true;
}

/** Change a job's cron schedule; validates, persists, and re-arms. */
export async function setJobSchedule(id: string, cron: string): Promise<boolean> {
  const l = live.get(id);
  if (!l?.job) return false; // manual jobs have no schedule to change
  // rescheduleJob returns the job on success, null on an invalid cron.
  const ok = rescheduleJob(l.job, cron);
  if (!ok) return false;
  l.cronSchedule = cron;
  await prisma.job.update({ where: { id }, data: { cronSchedule: cron } });
  return true;
}

export type JobStatus = {
  id: string;
  name: string;
  description: string;
  detailHref?: string;
  interval: JobDefinition["interval"];
  manual: boolean;
  cronSchedule: string;
  nextRunAt: Date | null;
  running: boolean;
  progress: JobProgress | null;
  lastRunAt: Date | null;
  lastFinishedAt: Date | null;
  lastStatus: string | null;
};

/** All jobs with their next-run time, running flag, and last-run bookkeeping. */
export async function listJobs(): Promise<JobStatus[]> {
  const rows = await prisma.job.findMany();
  const byId = new Map(rows.map((r) => [r.id, r]));

  return JOB_DEFINITIONS.map((def) => {
    const l = live.get(def.id);
    const row = byId.get(def.id);
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      detailHref: def.detailHref,
      interval: def.interval,
      manual: def.manual ?? false,
      cronSchedule: l?.cronSchedule ?? row?.cronSchedule ?? def.defaultCron,
      nextRunAt: l?.job?.nextInvocation() ?? null,
      running: l?.running ?? false,
      progress: l?.progress ?? null,
      lastRunAt: row?.lastRunAt ?? null,
      lastFinishedAt: row?.lastFinishedAt ?? null,
      lastStatus: row?.lastStatus ?? null,
    };
  });
}

export { jobDefinition };
