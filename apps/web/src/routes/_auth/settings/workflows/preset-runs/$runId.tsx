/**
 * Preset build run — the observability page. Package-first grid (each package a section, its channels lit up
 * create / update / delete / skip with live status), plus a replay timeline and a floating action bar with a
 * global scrubber + Stop — the same robust pattern as the AI-lineup run page, minus tokens/cost. Reads OUR
 * `PresetRun` / `PresetRunTrace` rows via Prisma, so it's identical for workflow- and job-mode builds.
 */
import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@airwave/ui/components/frame";
import { Switch } from "@airwave/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Ban, Check, Clock, Loader2, Pencil, Plus, RefreshCw, SkipForward, Trash2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@airwave/api/routers/index";

import { useConfirm } from "@/components/confirm-dialog";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/workflows/preset-runs/$runId")({
  component: PresetRunDetail,
});

const TERMINAL = new Set(["done", "failed", "cancelled"]);

const STATUS_TONE: Record<string, string> = {
  done: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600",
  running: "border-blue-500/30 bg-blue-500/15 text-blue-600",
  failed: "border-red-500/30 bg-red-500/15 text-red-600",
  cancelled: "text-muted-foreground",
};

// Op → label + pill tone.
const OP_META: Record<string, { label: string; cls: string; Icon: typeof Plus }> = {
  create: { label: "Create", cls: "bg-green-500/15 text-green-600 dark:text-green-400", Icon: Plus },
  update: { label: "Update", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400", Icon: Pencil },
  delete: { label: "Delete", cls: "bg-red-500/15 text-red-600 dark:text-red-400", Icon: Trash2 },
  skip: { label: "Skip", cls: "bg-muted text-muted-foreground", Icon: SkipForward },
};

// Gantt bar tone by state-at-T.
const SCRUB_BAR: Record<string, string> = {
  upcoming: "bg-muted-foreground/30",
  resolving: "bg-blue-500",
  pending: "bg-blue-500/60",
  done: "bg-emerald-500",
  failed: "bg-red-500",
};

type Trace = inferRouterOutputs<AppRouter>["preset"]["run"]["traces"][number];

function StatusIcon({ status }: { status: string }) {
  if (status === "done") return <Check className="size-4 shrink-0 text-emerald-500" />;
  if (status === "failed") return <X className="size-4 shrink-0 text-red-500" />;
  return <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />;
}

function StatTile({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="bg-muted/30 flex items-center gap-3 rounded-md border px-3 py-2.5">
      <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p className="text-muted-foreground text-[11px] tracking-wide uppercase">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
        {sub && <p className="text-muted-foreground truncate text-[11px]">{sub}</p>}
      </div>
    </div>
  );
}

function PresetRunDetail() {
  const { runId } = Route.useParams();
  const [scrub, setScrub] = useState<number | null>(null);
  const [stopping, setStopping] = useState(false);
  // Auto-refresh (default on) polls live runs; off makes Refresh the only way to update.
  const [autoPoll, setAutoPoll] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const q = useQuery({
    ...trpc.preset.run.queryOptions({ runId }),
    refetchInterval: (query) => {
      if (!autoPoll) return false;
      const s = query.state.data?.run.status;
      return s && TERMINAL.has(s) ? false : 2500;
    },
    retry: false,
  });

  const run = q.data?.run;
  const all: Trace[] = q.data?.traces ?? [];
  const isLive = !!run && !TERMINAL.has(run.status);

  // ── Global replay derivation (as-observed at time T) ─────────────────────────────────────────────
  const scrubMs = all
    .flatMap((r) => [new Date(r.startedAt).getTime(), r.finishedAt ? new Date(r.finishedAt).getTime() : NaN])
    .filter(Number.isFinite);
  const tMin = scrubMs.length ? Math.min(...scrubMs) : 0;
  const tEnd = scrubMs.length ? Math.max(...scrubMs) : 0;
  const tMax = isLive ? Math.max(tEnd, Date.now()) : tEnd;
  const scrubbing = scrub != null && scrub < tMax;
  const T = scrub ?? tMax;
  const asObserved = (r: Trace): Trace =>
    scrubbing && (!r.finishedAt || new Date(r.finishedAt).getTime() > T)
      ? { ...r, status: "resolving", finishedAt: null }
      : r;
  const observed = (scrubbing ? all.filter((r) => new Date(r.startedAt).getTime() <= T) : all).map(asObserved);

  // ── Package-first grouping ───────────────────────────────────────────────────────────────────────
  const packages = groupByPackage(observed);

  const runStatus = scrubbing ? "running" : (run?.status ?? null);

  // Live tallies straight from the trace rows (accurate before the run's final counts are written). A
  // "create" whose reason mentions the item floor was skipped, not created.
  const doneRows = observed.filter((t) => t.status === "done");
  const isSkipRow = (t: Trace) => t.op === "create" && !!t.reason?.includes("needed");
  const createdCount = doneRows.filter((t) => t.op === "create" && !isSkipRow(t)).length;
  const updatedCount = doneRows.filter((t) => t.op === "update").length;
  const deletedCount = doneRows.filter((t) => t.op === "delete").length;
  const skippedCount = doneRows.filter(isSkipRow).length;
  const runSecs = scrubMs.length ? Math.round(((isLive ? Date.now() : tEnd) - tMin) / 1000) : null;

  const onStop = async () => {
    if (!(await confirm({ title: "Stop this build?", confirmLabel: "Stop", destructive: true }))) return;
    setStopping(true);
    try {
      await trpcClient.preset.cancel.mutate({ runId });
      await q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't stop the run.");
    } finally {
      setStopping(false);
    }
  };

  if (q.isLoading) {
    return (
      <Frame>
        <FramePanel className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </FramePanel>
      </Frame>
    );
  }
  if (q.isError || !run) {
    return (
      <Frame>
        <FramePanel className="p-4 text-sm">Run not found.</FramePanel>
      </Frame>
    );
  }

  return (
    <div className="space-y-4 pb-4">
      {confirmDialog}

      {/* Summary */}
      <Frame>
        <FrameHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isLive && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
            <FrameTitle className="font-mono text-sm">{runId}</FrameTitle>
            {runStatus && (
              <Badge variant="outline" className={STATUS_TONE[runStatus] ?? ""}>
                {runStatus[0].toUpperCase() + runStatus.slice(1)}
              </Badge>
            )}
            <Badge variant="outline" className="text-muted-foreground">
              {run.mode}
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-muted-foreground flex items-center gap-1.5 text-xs whitespace-nowrap select-none">
              <Switch checked={autoPoll} onCheckedChange={(v) => setAutoPoll(v === true)} />
              Auto-refresh
            </label>
            <Button size="sm" variant="outline" onClick={() => void q.refetch()} disabled={q.isFetching}>
              {q.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh
            </Button>
          </div>
        </FrameHeader>
        <FramePanel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile
              icon={Plus}
              label="Created"
              value={<span className="text-emerald-600 dark:text-emerald-400">{createdCount}</span>}
              sub={skippedCount > 0 ? `${skippedCount} skipped` : undefined}
            />
            <StatTile
              icon={Pencil}
              label="Updated"
              value={<span className="text-amber-600 dark:text-amber-400">{updatedCount}</span>}
            />
            <StatTile
              icon={Trash2}
              label="Deleted"
              value={<span className="text-red-600 dark:text-red-400">{deletedCount}</span>}
            />
            <StatTile icon={Clock} label="Duration" value={runSecs != null ? `${runSecs}s` : isLive ? "running…" : "—"} />
          </div>
        </FramePanel>
      </Frame>

      {/* Package-first grid */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {packages.map((pkg) => (
          <FramePanel key={pkg.key} className="divide-border divide-y p-0">
            <div className="flex items-center justify-between gap-2 p-3">
              <p className="truncate text-sm font-medium">{pkg.name}</p>
              {pkg.working ? (
                <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" />
              ) : pkg.failed ? (
                <X className="size-4 shrink-0 text-red-500" />
              ) : (
                <Check className="size-4 shrink-0 text-emerald-500" />
              )}
            </div>
            {pkg.channels.map((c) => {
              const op = OP_META[c.op ?? ""] ?? OP_META.skip;
              return (
                <div key={c.id} className="flex items-center gap-2 p-2.5 text-sm">
                  <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " + op.cls}>
                    {op.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {c.channelNumber != null && (
                      <span className="text-muted-foreground tabular-nums">{c.channelNumber} </span>
                    )}
                    {c.channelName}
                  </span>
                  {c.itemCount != null && (
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{c.itemCount}</span>
                  )}
                  <StatusIcon status={c.status} />
                </div>
              );
            })}
          </FramePanel>
        ))}
        {packages.length === 0 && (
          <FramePanel className="text-muted-foreground p-4 text-sm">
            {isLive ? "Waiting for the build to start…" : "No channels were affected."}
          </FramePanel>
        )}
      </div>

      {/* Replay timeline */}
      <RunScrubber traces={observed} t={T} tMin={tMin} tMax={tMax} scrubbing={scrubbing} live={isLive} />

      {/* Floating action bar */}
      <RunActionBar
        runStatus={runStatus}
        isLive={isLive}
        scrubbing={scrubbing}
        t={T}
        tMin={tMin}
        tMax={tMax}
        onScrub={setScrub}
        onLive={() => setScrub(null)}
        onStop={onStop}
        stopping={stopping}
      />
    </div>
  );
}

type PackageGroup = { key: string; name: string; channels: Trace[]; working: boolean; failed: boolean };

/** Group channel traces by package, preserving first-seen order, and derive each package's roll-up state. */
function groupByPackage(traces: Trace[]): PackageGroup[] {
  const byKey = new Map<string, PackageGroup>();
  for (const t of traces) {
    let g = byKey.get(t.packageKey);
    if (!g) byKey.set(t.packageKey, (g = { key: t.packageKey, name: t.packageName, channels: [], working: false, failed: false }));
    g.channels.push(t);
    if (t.status === "pending" || t.status === "resolving") g.working = true;
    if (t.status === "failed") g.failed = true;
  }
  return [...byKey.values()];
}

/** Replay gantt: every trace row on a shared time axis, with a playhead at T. */
function RunScrubber({
  traces,
  t,
  tMin,
  tMax,
  scrubbing,
  live,
}: {
  traces: Trace[];
  t: number;
  tMin: number;
  tMax: number;
  scrubbing: boolean;
  live: boolean;
}) {
  if (!traces.length) return null;
  const rows = traces
    .map((r) => ({ ...r, start: new Date(r.startedAt).getTime(), end: r.finishedAt ? new Date(r.finishedAt).getTime() : null }))
    .sort((a, b) => a.start - b.start);
  const now = Date.now();
  const span = Math.max(1, tMax - tMin);
  const pct = (ms: number) => ((ms - tMin) / span) * 100;
  const stateAt = (r: (typeof rows)[number]) => (r.start > t ? "upcoming" : r.end == null || r.end > t ? "resolving" : r.status);
  const runningNow = rows.filter((r) => stateAt(r) === "resolving").length;

  return (
    <Frame>
      <FrameHeader className="flex-row items-center justify-between gap-2">
        <FrameTitle className="text-sm">Replay timeline</FrameTitle>
        <span className="text-muted-foreground text-xs tabular-nums">
          {new Date(t).toLocaleTimeString()}
          {!scrubbing ? (live ? " · live" : " · end") : ""} · {runningNow} running
        </span>
      </FrameHeader>
      <FramePanel>
        <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
          {rows.map((r) => {
            const st = stateAt(r);
            const left = pct(r.start);
            const width = Math.max(pct(r.end ?? (live ? now : r.start)) - left, 0.6);
            return (
              <div key={r.id} className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground w-44 shrink-0 truncate">{r.channelName}</span>
                <div className="bg-muted/40 relative h-3 flex-1 overflow-hidden rounded">
                  <div
                    className={`absolute inset-y-0 rounded ${SCRUB_BAR[st] ?? SCRUB_BAR.upcoming} ${st === "resolving" ? "animate-pulse" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                  <div className="bg-foreground/50 absolute inset-y-0 w-px" style={{ left: `${pct(t)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </FramePanel>
    </Frame>
  );
}

/** Floating bottom bar — status, global scrubber, jump-to-live/end, Stop. */
function RunActionBar({
  runStatus,
  isLive,
  scrubbing,
  t,
  tMin,
  tMax,
  onScrub,
  onLive,
  onStop,
  stopping,
}: {
  runStatus: string | null;
  isLive: boolean;
  scrubbing: boolean;
  t: number;
  tMin: number;
  tMax: number;
  onScrub: (ms: number | null) => void;
  onLive: () => void;
  onStop: () => void;
  stopping: boolean;
}) {
  const span = Math.max(1, tMax - tMin);
  return (
    <div className="pointer-events-none sticky bottom-6 z-40 mt-4 flex justify-center px-2">
      <div className="bg-card pointer-events-auto flex w-full max-w-4xl items-center gap-3 rounded-md border py-2 pr-2 pl-3 shadow-[0_25px_60px_-10px_rgba(0,0,0,0.65),0_10px_25px_-8px_rgba(0,0,0,0.5)] dark:shadow-[0_25px_70px_-8px_rgba(0,0,0,0.9),0_10px_25px_-6px_rgba(0,0,0,0.75)]">
        {runStatus && (
          <Badge variant="outline" className={"shrink-0 " + (STATUS_TONE[runStatus] ?? "")}>
            {runStatus[0].toUpperCase() + runStatus.slice(1)}
          </Badge>
        )}
        <span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">{new Date(t).toLocaleTimeString()}</span>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(((t - tMin) / span) * 1000)}
          onChange={(e) => {
            const nv = tMin + (Number(e.target.value) / 1000) * span;
            onScrub(nv >= tMax - 1 ? null : nv);
          }}
          className="min-w-0 flex-1"
          aria-label="Scrub the run"
        />
        <Button size="sm" variant="ghost" onClick={onLive} disabled={!scrubbing} className="shrink-0">
          {isLive ? "Live" : "End"}
        </Button>
        {isLive && (
          <Button
            size="sm"
            variant="outline"
            onClick={onStop}
            disabled={stopping}
            className="shrink-0 text-red-600 hover:text-red-600 dark:text-red-500"
          >
            {stopping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
            Stop
          </Button>
        )}
      </div>
    </div>
  );
}
