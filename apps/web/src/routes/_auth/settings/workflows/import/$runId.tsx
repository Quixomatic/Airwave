/**
 * One lineup import run — a multi-tiered progress page: packages tier over a channels tier, so you can
 * watch what got created (or, in a dry-run, what WOULD be) channel-by-channel as the workflow runs.
 *
 * All of it comes from `ImportTrace` (a row per package summary + per channel outcome) plus the SDK's
 * own step timeline. No AI, no token cost — this is purely "did each thing land, and how big is its pool".
 */
import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@airwave/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/workflows/import/$runId")({
  staticData: { breadcrumb: "Run" },
  component: ImportRunDetail,
});

const STATUS_TONE: Record<string, string> = {
  ok: "text-emerald-600",
  created: "text-emerald-600",
  completed: "text-emerald-600",
  running: "text-blue-600",
  skipped: "text-muted-foreground",
  disabled: "text-amber-600",
  failed: "text-red-600",
  cancelled: "text-muted-foreground",
};

const n = (v: number) => v.toLocaleString();

function Chip({ label, value, tone }: { label: string; value: number; tone?: string }) {
  if (!value) return null;
  return (
    <span className="bg-muted flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
      <span className={`font-semibold ${tone ?? ""}`}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function ImportRunDetail() {
  const { runId } = Route.useParams();

  const steps = useQuery({
    ...trpc.transfer.importRunSteps.queryOptions({ runId }),
    refetchInterval: (q) => ((q.state.data ?? []).some((s) => s.status === "running") ? 2500 : false),
  });
  const isLive = (steps.data ?? []).some((s) => s.status === "running");
  const traces = useQuery({
    ...trpc.transfer.importRunTraces.queryOptions({ runId }),
    refetchInterval: isLive ? 2500 : false,
  });

  const all = traces.data ?? [];
  const dryRun = all.some((t) => t.dryRun);
  const report = all.find((t) => t.phase === "report");
  const pkgTrace = all.find((t) => t.phase === "packages");
  const channels = all
    .filter((t) => t.phase === "channel")
    .sort((a, b) => (a.channelNumber ?? 0) - (b.channelNumber ?? 0));

  const counts = {
    created: channels.filter((c) => c.status === "created").length,
    disabled: channels.filter((c) => c.status === "disabled").length,
    skipped: channels.filter((c) => c.status === "skipped").length,
    failed: channels.filter((c) => c.status === "failed").length,
  };

  // Overall progress: settled channel builds over the plan's to-create count. The plan step lands first
  // and carries the denominator, so the bar is accurate from the second the fan-out begins.
  const planCounts = (all.find((t) => t.phase === "plan")?.output as { counts?: { toCreate?: number } })?.counts;
  const totalToBuild = planCounts?.toCreate ?? channels.filter((c) => c.status !== "skipped").length;
  const built = counts.created + counts.disabled + counts.failed;
  const pct = report ? 100 : totalToBuild > 0 ? Math.min(99, Math.round((built / totalToBuild) * 100)) : all.length ? 3 : 0;

  // Group channels by package key for the multi-tier view.
  const groups = new Map<string, typeof channels>();
  for (const c of channels) {
    const k = c.packageKey ?? "__ungrouped__";
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(c);
  }

  return (
    <div className="space-y-4">
      <Frame>
        <FrameHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <FrameTitle className="font-mono text-sm">{runId}</FrameTitle>
            {isLive && <Loader2 className="text-blue-600 h-4 w-4 animate-spin" />}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void traces.refetch();
              void steps.refetch();
            }}
            disabled={traces.isFetching}
          >
            {traces.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </FrameHeader>
        <FramePanel className="space-y-3">
          {dryRun && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-400">
              DRY RUN — nothing was imported. This validated + resolved the lineup and computed everything it
              would do, but wrote no packages, channels, or schedules.
            </div>
          )}
          {/* Overall progress bar — live channel-build progress at a glance. */}
          <div className="space-y-1">
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>{report ? (dryRun ? "Dry run complete" : "Complete") : isLive ? "Importing…" : "Progress"}</span>
              <span>
                {built}/{totalToBuild} channels{pct === 100 ? "" : ` · ${pct}%`}
              </span>
            </div>
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  counts.failed ? "bg-amber-500" : "bg-primary"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip label="created" value={counts.created} tone="text-emerald-600" />
            <Chip label="disabled" value={counts.disabled} tone="text-amber-600" />
            <Chip label="skipped (duplicate)" value={counts.skipped} tone="text-muted-foreground" />
            <Chip label="failed" value={counts.failed} tone="text-red-600" />
            {report ? (
              <span className="text-muted-foreground ml-auto self-center text-xs">
                {(report.output as { packagesCreated?: number })?.packagesCreated ?? 0} packages created ·{" "}
                {(report.output as { packagesReused?: number })?.packagesReused ?? 0} reused
              </span>
            ) : (
              <span className="text-muted-foreground ml-auto self-center text-xs">
                {isLive ? "running…" : "no report yet"}
              </span>
            )}
          </div>
        </FramePanel>
      </Frame>

      {/* Packages tier. */}
      {pkgTrace && (
        <Frame>
          <FrameHeader>
            <FrameTitle className="text-sm">Packages</FrameTitle>
          </FrameHeader>
          <FramePanel className="flex flex-wrap gap-2">
            {((pkgTrace.output as { packages?: { key: string; name: string; action: string }[] })?.packages ?? []).map(
              (p) => (
                <span key={p.key} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs">
                  <span className="font-medium">{p.name}</span>
                  <Badge variant="outline" className={p.action === "reuse" ? "text-muted-foreground" : "text-emerald-600"}>
                    {p.action === "reuse" ? "reused" : dryRun ? "would create" : "created"}
                  </Badge>
                </span>
              ),
            )}
          </FramePanel>
        </Frame>
      )}

      {/* Channels tier — grouped by package. */}
      <Frame>
        <FrameHeader>
          <FrameTitle className="text-sm">Channels ({channels.length})</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-4">
          {!channels.length && (
            <p className="text-muted-foreground text-sm">{isLive ? "Waiting for the plan…" : "No channels."}</p>
          )}
          {[...groups.entries()].map(([key, chs]) => (
            <div key={key} className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {key === "__ungrouped__" ? "Ungrouped" : key}
              </p>
              {chs.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                  <span className={`w-16 shrink-0 text-xs font-medium ${STATUS_TONE[c.status] ?? ""}`}>
                    {dryRun && c.status === "created" ? "would" : c.status}
                  </span>
                  <span className="text-muted-foreground w-12 shrink-0 tabular-nums">{c.channelNumber}</span>
                  <span className="min-w-0 flex-1 truncate">{c.channelName}</span>
                  {c.numberReassigned && <span className="shrink-0 text-xs text-amber-600">renumbered</span>}
                  {c.poolSize != null && (
                    <span className="text-muted-foreground shrink-0 text-xs">{n(c.poolSize)} items</span>
                  )}
                  {c.scheduleSlots != null && (
                    <span className="text-muted-foreground shrink-0 text-xs">{n(c.scheduleSlots)} slots</span>
                  )}
                  {c.reason && c.status !== "created" && (
                    <span className="text-muted-foreground max-w-[40%] shrink-0 truncate text-xs" title={c.reason}>
                      {c.reason}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </FramePanel>
      </Frame>

      {/* The SDK's outside view — durations + retries per step. */}
      <Frame>
        <FrameHeader>
          <FrameTitle className="text-sm">Step timeline ({steps.data?.length ?? 0})</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-1">
          {steps.data?.map((s) => (
            <div key={s.stepId} className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-xs">
              <span className={`w-20 shrink-0 font-medium ${STATUS_TONE[s.status] ?? ""}`}>{s.status}</span>
              <span className="flex-1 truncate font-mono">{s.name}</span>
              {s.attempt > 1 && <span className="text-amber-600">attempt {s.attempt}</span>}
              <span className="text-muted-foreground w-14 shrink-0 text-right">
                {s.durationSeconds != null ? `${s.durationSeconds}s` : "—"}
              </span>
            </div>
          ))}
        </FramePanel>
      </Frame>
    </div>
  );
}
