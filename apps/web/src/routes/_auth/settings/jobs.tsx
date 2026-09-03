import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import { Card } from "@airwave/ui/components/card";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import cronstrue from "cronstrue";
import { ArrowUpRight, CalendarClock, Clock, Hand, History, Loader2, Pencil, Play, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/jobs")({
  staticData: { breadcrumb: "Jobs & Cache" },
  component: SettingsJobs,
});

type Job = {
  id: string;
  name: string;
  description: string;
  detailHref?: string;
  interval: "seconds" | "minutes" | "hours" | "days" | "fixed";
  cronSchedule: string;
  nextRunAt: string | Date | null;
  running: boolean;
  progress: { current: number; total: number; label: string } | null;
  lastRunAt: string | Date | null;
  lastFinishedAt: string | Date | null;
  lastStatus: string | null;
};

const SELECT = "border-input bg-background h-9 rounded-md border px-2 text-sm";

function SettingsJobs() {
  // Poll faster while any job is running so its progress bar is live.
  const jobs = useQuery({
    ...trpc.jobs.list.queryOptions(),
    refetchInterval: (q) => (q.state.data?.some((j) => j.running) ? 1500 : 5000),
  });
  const [editing, setEditing] = useState<Job | null>(null);

  const run = async (job: Job) => {
    try {
      await trpcClient.jobs.run.mutate({ id: job.id });
      toast.success(`${job.name} started.`);
      await jobs.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start job");
    }
  };

  const cancel = async (job: Job) => {
    try {
      await trpcClient.jobs.cancel.mutate({ id: job.id });
      toast.success(`${job.name} canceled.`);
      await jobs.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel job");
    }
  };

  const all = jobs.data ?? [];
  const manualJobs = all.filter((j) => j.interval === "fixed");
  const scheduledJobs = all.filter((j) => j.interval !== "fixed");

  return (
    <div className="space-y-4">
      {/* Manual jobs — run-now only, never auto-fire. In their own frame so they're easy to find. */}
      <Frame>
        <FrameHeader>
          <FrameTitle className="flex items-center gap-2">
            <Hand className="size-4" /> Manual jobs
          </FrameTitle>
          <FrameDescription>
            Run these on demand — they never fire on their own. Some (like the AI lineup builder) do
            their real work elsewhere; follow "View runs &amp; cost" to watch progress.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="divide-border divide-y p-0">
          {manualJobs.map((job) => (
            <JobRow key={job.id} job={job} onEdit={setEditing} onRun={run} onCancel={cancel} />
          ))}
          {jobs.data && manualJobs.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">No manual jobs.</p>
          )}
        </FramePanel>
      </Frame>

      {/* Scheduled jobs — maintenance that runs automatically on a cron. */}
      <Frame>
        <FrameHeader>
          <FrameTitle className="flex items-center gap-2">
            <CalendarClock className="size-4" /> Scheduled jobs
          </FrameTitle>
          <FrameDescription>
            Maintenance Airwave runs automatically — metadata sync, library scans, and topping up
            channel schedules. Trigger any now or change how often it runs; running one manually
            doesn't change its schedule.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="divide-border divide-y p-0">
          {scheduledJobs.map((job) => (
            <JobRow key={job.id} job={job} onEdit={setEditing} onRun={run} onCancel={cancel} />
          ))}
          {jobs.data && scheduledJobs.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">No scheduled jobs.</p>
          )}
        </FramePanel>
      </Frame>

      {editing && (
        <EditScheduleModal
          job={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await jobs.refetch();
          }}
        />
      )}
    </div>
  );
}

/** One job's row — shared by the Manual and Scheduled frames. */
function JobRow({
  job,
  onEdit,
  onRun,
  onCancel,
}: {
  job: Job;
  onEdit: (job: Job) => void;
  onRun: (job: Job) => void | Promise<void>;
  onCancel: (job: Job) => void | Promise<void>;
}) {
  return (
    <div className="space-y-2.5 p-4">
      <div className="flex items-center gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{job.name}</p>
            {/* Auto = runs on a schedule; Manual = run-now only (never auto-fires). */}
            <Badge
              variant="outline"
              className={
                job.interval === "fixed"
                  ? "gap-1 border-amber-500/30 bg-amber-500/15 text-amber-600"
                  : "gap-1 border-sky-500/30 bg-sky-500/15 text-sky-600"
              }
            >
              {job.interval === "fixed" ? (
                <Hand className="size-3" />
              ) : (
                <CalendarClock className="size-3" />
              )}
              {job.interval === "fixed" ? "Manual" : "Auto"}
            </Badge>
            {job.running && (
              <span className="text-primary inline-flex items-center gap-1 text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> running
              </span>
            )}
            {!job.running && job.lastStatus === "failed" && (
              <span className="text-destructive text-xs">last run failed</span>
            )}
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">{job.description}</p>
          {/* Dispatcher jobs finish instantly but their real work lives elsewhere —
              without this the Jobs row is a dead end. */}
          {job.detailHref && (
            <Link
              to={job.detailHref}
              className="text-primary mt-1 inline-flex items-center gap-1 text-xs hover:underline"
            >
              View runs &amp; cost
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
          {/* Schedule details as badges. Manual (fixed) jobs never auto-fire, so no
              cron/"next" — just the last run if there was one. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {job.interval !== "fixed" && (
              <>
                <Badge variant="outline" className="text-muted-foreground gap-1 font-normal">
                  <CalendarClock className="size-3" /> {describeCron(job.cronSchedule)}
                </Badge>
                <Badge variant="outline" className="text-muted-foreground gap-1 font-normal">
                  <Clock className="size-3" /> Next {formatWhen(job.nextRunAt)}
                </Badge>
              </>
            )}
            {job.lastFinishedAt && (
              <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/15 font-normal text-emerald-600">
                <History className="size-3" /> Last ran {formatWhen(job.lastFinishedAt)}
              </Badge>
            )}
          </div>
        </div>

        {/* Edit before Run. Manual (fixed) jobs have no schedule to edit — show the button
            disabled rather than hiding it, so the row layout stays consistent. */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onEdit(job)}
          disabled={job.interval === "fixed"}
          title={job.interval === "fixed" ? "Manual jobs have no schedule to edit" : "Edit schedule"}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {job.running ? (
          <Button variant="outline" size="sm" onClick={() => void onCancel(job)}>
            <X className="mr-1 h-3.5 w-3.5" /> Cancel
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => void onRun(job)}>
            <Play className="mr-1 h-3.5 w-3.5" /> Run now
          </Button>
        )}
      </div>

      {job.running && <JobProgress progress={job.progress} />}
    </div>
  );
}

const INTERVAL_OPTIONS: Record<string, number[]> = {
  seconds: [30, 45, 60],
  minutes: [5, 10, 15, 20, 30, 60],
  hours: [1, 2, 3, 4, 6, 8, 12, 24],
  days: [1, 2, 3, 7, 14, 30],
};

/** Build a 6-field (seconds-first) cron for "every N <unit>", matching seerr. */
function buildCron(interval: Job["interval"], value: number): string {
  const parts = ["0", "0", "*", "*", "*", "*"]; // sec min hour dom mon dow
  if (interval === "seconds") return `*/${value} * * * * *`;
  if (interval === "minutes") parts[1] = `*/${value}`;
  else if (interval === "hours") parts[2] = `*/${value}`;
  else if (interval === "days") {
    parts[2] = "1";
    parts[3] = `*/${value}`;
  }
  return parts.join(" ");
}

function EditScheduleModal({
  job,
  onClose,
  onSaved,
}: {
  job: Job;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const options = INTERVAL_OPTIONS[job.interval] ?? [];
  const [value, setValue] = useState(options[0] ?? 1);
  const [saving, setSaving] = useState(false);
  const previewCron = buildCron(job.interval, value);
  const unit = job.interval.replace(/s$/, "");

  const save = async () => {
    setSaving(true);
    try {
      await trpcClient.jobs.setSchedule.mutate({ id: job.id, schedule: previewCron });
      toast.success("Job schedule updated.");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save schedule");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-md space-y-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div>
          <h2 className="text-lg font-semibold">Modify {job.name}</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Current: {describeCron(job.cronSchedule)}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">New frequency</label>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Every</span>
            <select
              className={SELECT}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            >
              {options.map((v) => (
                <option key={v} value={v}>
                  {v === 1 ? `1 ${unit}` : `${v} ${unit}s`}
                </option>
              ))}
            </select>
          </div>
          <p className="text-muted-foreground text-xs">{describeCron(previewCron)}</p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </Card>
    </div>
  );
}

function JobProgress({
  progress,
}: {
  progress: { current: number; total: number; label: string } | null;
}) {
  const pct = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : null;
  return (
    <div>
      <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs">
        <span className="truncate">{progress?.label ?? "Starting…"}</span>
        {progress && progress.total > 0 && (
          <span className="shrink-0 tabular-nums">
            {progress.current} / {progress.total}
          </span>
        )}
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className={`bg-primary h-full rounded-full transition-all ${pct == null ? "w-1/3 animate-pulse" : ""}`}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function describeCron(cron: string): string {
  try {
    return cronstrue.toString(cron, { verbose: false });
  } catch {
    return cron;
  }
}

function formatWhen(d: string | Date | null): string {
  if (!d) return "—";
  const diffMs = new Date(d).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (abs < 60000) return "just now";
  if (abs < 3600000) return rtf.format(Math.round(diffMs / 60000), "minute");
  if (abs < 86400000) return rtf.format(Math.round(diffMs / 3600000), "hour");
  return rtf.format(Math.round(diffMs / 86400000), "day");
}
