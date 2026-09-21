/**
 * Preset build runs — the index. Each row links to that run's observability page.
 */
import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/preset-runs/")({
  component: PresetRuns,
});

const STATUS_BADGE: Record<string, string> = {
  done: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600",
  running: "border-blue-500/30 bg-blue-500/15 text-blue-600",
  failed: "border-red-500/30 bg-red-500/15 text-red-600",
  cancelled: "text-muted-foreground",
};

function PresetRuns() {
  const runs = useQuery({
    ...trpc.preset.runs.queryOptions({ limit: 25 }),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "running") ? 3000 : false),
  });

  return (
    <Frame>
      <FrameHeader className="flex-row items-center justify-between">
        <div>
          <FrameTitle>Preset build runs</FrameTitle>
          <FrameDescription>
            Every preset generator build — what it created, updated, and deleted. Start one from Channels →
            Auto-generate → Preset generator.
          </FrameDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => void runs.refetch()} disabled={runs.isFetching}>
          {runs.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </FrameHeader>
      <FramePanel className="p-0">
        {runs.isLoading && <p className="text-muted-foreground p-4 text-sm">Loading…</p>}
        {runs.data?.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">No preset builds yet.</p>
        )}
        <div className="divide-border divide-y">
          {runs.data?.map((r) => (
            <Link
              key={r.id}
              to="/settings/preset-runs/$runId"
              params={{ runId: r.id }}
              className="hover:bg-muted/50 flex items-center gap-3 p-4 text-left"
            >
              <Badge variant="outline" className={"shrink-0 " + (STATUS_BADGE[r.status] ?? "")}>
                {r.status[0].toUpperCase() + r.status.slice(1)}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="text-emerald-600 dark:text-emerald-400">+{r.created}</span>{" "}
                  <span className="text-amber-600 dark:text-amber-400">~{r.updated}</span>{" "}
                  <span className="text-red-600 dark:text-red-400">-{r.deleted}</span>
                  <span className="text-muted-foreground"> · {r.mode}</span>
                </p>
                <p className="text-muted-foreground text-xs">{new Date(r.startedAt).toLocaleString()}</p>
              </div>
              <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
            </Link>
          ))}
        </div>
      </FramePanel>
    </Frame>
  );
}
