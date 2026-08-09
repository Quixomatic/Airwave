/**
 * Lineup import runs — the index. Each row links to that run's progress page.
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

export const Route = createFileRoute("/_auth/settings/workflows/import/")({
  component: ImportRuns,
});

const STATUS_BADGE: Record<string, string> = {
  completed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600",
  running: "border-blue-500/30 bg-blue-500/15 text-blue-600",
  failed: "border-red-500/30 bg-red-500/15 text-red-600",
  cancelled: "text-muted-foreground",
};

function ImportRuns() {
  const runs = useQuery({
    ...trpc.transfer.importRuns.queryOptions({ limit: 20 }),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "running") ? 3000 : false),
  });

  return (
    <Frame>
      <FrameHeader className="flex-row items-center justify-between">
        <div>
          <FrameTitle>Lineup import runs</FrameTitle>
          <FrameDescription>Every import — status, steps, and duration. Start one from Import / Export.</FrameDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => void runs.refetch()} disabled={runs.isFetching}>
          {runs.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </FrameHeader>
      <FramePanel className="p-0">
        {runs.isLoading && <p className="text-muted-foreground p-4 text-sm">Loading…</p>}
        {runs.data?.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">
            No imports yet — upload a lineup from Settings → Import / Export.
          </p>
        )}
        <div className="divide-border divide-y">
          {runs.data?.map((r) => (
            <Link
              key={r.runId}
              to="/settings/workflows/import/$runId"
              params={{ runId: r.runId }}
              className="hover:bg-muted/50 flex items-center gap-3 p-4 text-left"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`capitalize ${STATUS_BADGE[r.status] ?? ""}`}>
                    {r.status}
                  </Badge>
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
              <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
            </Link>
          ))}
        </div>
      </FramePanel>
    </Frame>
  );
}
