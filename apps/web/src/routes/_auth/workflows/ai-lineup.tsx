/**
 * AI lineup observability — every run, what it produced, and what it cost.
 *
 * Deliberately its own section rather than living under /channels: this is about the
 * WORKFLOW, not the channels it happens to create. Run metadata comes from the Workflow
 * SDK's own tables; the per-run report (channels created, skipped, failed, and the token
 * counts) is the workflow's return value, fetched on demand.
 *
 * The token numbers are the point. Every cost lesson in this arc was learned after the
 * fact from terminal logs — this is so a run's spend is visible while it's happening.
 */
import { Badge } from "@ChannelGuide/ui/components/badge";
import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/workflows/ai-lineup")({
  staticData: { breadcrumb: "AI Lineup" },
  component: AiLineupRuns,
});

/** Rough $/MTok so a run's spend is legible at a glance. Cache reads are ~0.1x input. */
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
};

/** One channel's outcome from the run report. `reason` is the model's own explanation. */
type ChannelResult = {
  key: string;
  name: string;
  number: number;
  reason?: string;
};

type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  steps: number;
  channelsWithUsage: number;
};

const n = (v: number) => v.toLocaleString();

/**
 * Cost estimate. Uncached input bills at 1x, cache WRITES at ~1.25x and cache READS at
 * ~0.1x — so a run that looks expensive by raw token count can be far cheaper in reality,
 * and vice versa. Rates default to the worker model since it dominates the volume.
 */
function estimateCost(u: Usage, rate = PRICING["claude-haiku-4-5"]!) {
  const uncached = Math.max(0, u.inputTokens - u.cacheReadTokens - u.cacheWriteTokens);
  const dollars =
    (uncached * rate.in + u.cacheWriteTokens * rate.in * 1.25 + u.cacheReadTokens * rate.in * 0.1) / 1_000_000 +
    (u.outputTokens * rate.out) / 1_000_000;
  return dollars;
}

const STATUS_TONE: Record<string, string> = {
  completed: "text-emerald-600",
  running: "text-blue-600",
  failed: "text-red-600",
  cancelled: "text-muted-foreground",
};

function AiLineupRuns() {
  const [openRun, setOpenRun] = useState<string | null>(null);

  // Poll while anything is in flight so a live run updates without a manual refresh.
  const runs = useQuery({
    ...trpc.ai.lineupRuns.queryOptions({ limit: 20 }),
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.status === "running") ? 3000 : false,
  });

  const report = useQuery({
    ...trpc.ai.lineupRun.queryOptions({ runId: openRun ?? "" }),
    enabled: !!openRun,
  });

  // The fan-out breakdown. Polls while the run is live so steps tick over as they finish.
  const steps = useQuery({
    ...trpc.ai.lineupRunSteps.queryOptions({ runId: openRun ?? "" }),
    enabled: !!openRun,
    refetchInterval: (q) =>
      (q.state.data ?? []).some((s) => s.status === "running") ? 3000 : false,
  });

  const output = report.data?.output as
    | {
        channelsCreated?: number;
        channelsPlanned?: number;
        packagesCreated?: number;
        skipped?: unknown[];
        failed?: unknown[];
        usage?: Usage;
      }
    | undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>AI lineup runs</CardTitle>
          <Button size="sm" variant="outline" onClick={() => void runs.refetch()} disabled={runs.isFetching}>
            {runs.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {runs.data?.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No runs yet — start one from Settings → Jobs → “Build Lineup with AI”.
            </p>
          )}
          {runs.data?.map((r) => (
            <button
              key={r.runId}
              type="button"
              onClick={() => setOpenRun(r.runId === openRun ? null : r.runId)}
              className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-md border p-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${STATUS_TONE[r.status] ?? ""}`}>{r.status}</span>
                  <span className="text-muted-foreground truncate font-mono text-xs">{r.runId}</span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {r.steps.completed}/{r.steps.total} steps
                  {r.steps.failed > 0 && <span className="text-red-600"> · {r.steps.failed} failed</span>}
                  {r.steps.running > 0 && <span className="text-blue-600"> · {r.steps.running} running</span>}
                  {r.durationSeconds != null && ` · ${r.durationSeconds}s`}
                  {r.startedAt && ` · ${new Date(r.startedAt).toLocaleString()}`}
                </div>
              </div>
              {r.status === "running" && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
            </button>
          ))}
        </CardContent>
      </Card>

      {openRun && (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-sm">{openRun}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.isLoading && <p className="text-muted-foreground text-sm">Loading report…</p>}
            {report.data && !output && (
              <p className="text-muted-foreground text-sm">
                No report yet — it's written when the run finishes.
              </p>
            )}
            {output && (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{output.channelsCreated ?? 0} channels built</Badge>
                  {/* The planner designs the whole lineup even when only a sample is built,
                      so show both — otherwise a capped run reads as a shortfall. */}
                  {!!output.channelsPlanned && output.channelsPlanned !== output.channelsCreated && (
                    <Badge variant="outline">{output.channelsPlanned} planned</Badge>
                  )}
                  <Badge variant="outline">{output.packagesCreated ?? 0} packages</Badge>
                  {!!output.skipped?.length && <Badge variant="outline">{output.skipped.length} skipped</Badge>}
                  {!!output.failed?.length && <Badge variant="outline">{output.failed.length} failed</Badge>}
                </div>
                {output.usage && (
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <Row label="Input tokens" value={n(output.usage.inputTokens)} />
                    <Row label="Output tokens" value={n(output.usage.outputTokens)} />
                    <Row label="Cache reads (~0.1×)" value={n(output.usage.cacheReadTokens)} />
                    <Row label="Cache writes (~1.25×)" value={n(output.usage.cacheWriteTokens)} />
                    <Row label="Agent steps" value={n(output.usage.steps)} />
                    <Row
                      label="Steps per channel"
                      value={
                        output.usage.channelsWithUsage
                          ? (output.usage.steps / output.usage.channelsWithUsage).toFixed(1)
                          : "—"
                      }
                    />
                    <Row
                      label="Est. build cost (worker rates)"
                      value={`$${estimateCost(output.usage).toFixed(2)}`}
                    />
                  </div>
                )}
                {/* The planner runs on a different (usually pricier) model and its usage
                    isn't part of the per-channel totals, so say so rather than letting the
                    build figure read as the whole bill. */}
                <p className="text-muted-foreground text-xs">
                  Build steps only — the planning call runs on the planner model and isn't included.
                </p>

                {/* Per-channel outcomes. For a skip, `reason` is the model's own analysis of
                    why the channel couldn't be built — the most useful thing on this page. */}
                {[
                  { label: "Skipped", items: output.skipped ?? [], tone: "text-amber-600" },
                  { label: "Failed", items: output.failed ?? [], tone: "text-red-600" },
                ].map(({ label, items, tone }) =>
                  items.length ? (
                    <div key={label} className="space-y-2">
                      <p className={`text-sm font-medium ${tone}`}>
                        {label} ({items.length})
                      </p>
                      {(items as ChannelResult[]).map((c) => (
                        <div key={`${c.number}-${c.key}`} className="rounded-md border p-3">
                          <p className="text-sm font-medium">
                            {c.number} {c.name}
                          </p>
                          <p className="text-muted-foreground mt-1 text-xs whitespace-pre-wrap">
                            {c.reason}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null,
                )}
              </>
            )}

            {/* Step timeline — the fan-out. Each buildChannel is its own durable step. */}
            {!!steps.data?.length && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Steps ({steps.data.length})</p>
                {steps.data.map((s) => (
                  <div
                    key={s.stepId}
                    className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-xs"
                  >
                    <span className={`w-20 shrink-0 font-medium ${STATUS_TONE[s.status] ?? ""}`}>
                      {s.status}
                    </span>
                    <span className="flex-1 truncate font-mono">{s.name}</span>
                    {s.attempt > 1 && (
                      <span className="text-amber-600">attempt {s.attempt}</span>
                    )}
                    <span className="text-muted-foreground w-14 shrink-0 text-right">
                      {s.durationSeconds != null ? `${s.durationSeconds}s` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
