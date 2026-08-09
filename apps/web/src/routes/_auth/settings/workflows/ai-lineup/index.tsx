/**
 * AI lineup runs — the index. Each row links to that run's own page.
 *
 * Deliberately its own section rather than living under /channels: this is about the WORKFLOW,
 * not the channels it happens to create.
 *
 * Detail deliberately does NOT live here. A run's substance — the full plan, and every
 * channel build's tool calls and reasoning — is far more than a list row can hold, so it
 * moved to `/settings/workflows/ai-lineup/$runId`. This page stays a scannable index of
 * what ran, when, and how far it got.
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

// Breadcrumb lives on the layout (`route.tsx`) now, so it isn't repeated on every child.
export const Route = createFileRoute("/_auth/settings/workflows/ai-lineup/")({
  component: AiLineupRuns,
});

/** Coloured outline pill per run status. */
const STATUS_BADGE: Record<string, string> = {
  completed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-600",
  running: "border-blue-500/30 bg-blue-500/15 text-blue-600",
  failed: "border-red-500/30 bg-red-500/15 text-red-600",
  cancelled: "text-muted-foreground",
};

function AiLineupRuns() {
  // Poll while anything is in flight so a live run updates without a manual refresh.
  const runs = useQuery({
    ...trpc.ai.lineupRuns.queryOptions({ limit: 20 }),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "running") ? 3000 : false),
  });

  return (
    <Frame>
      <FrameHeader className="flex-row items-center justify-between">
        <div>
          <FrameTitle>AI lineup runs</FrameTitle>
          <FrameDescription>Every run of the AI lineup builder — status, steps, and duration.</FrameDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void runs.refetch()}
          disabled={runs.isFetching}
        >
          {runs.isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </FrameHeader>
      <FramePanel className="p-0">
        {runs.isLoading && <p className="text-muted-foreground p-4 text-sm">Loading…</p>}
        {runs.data?.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">
            No runs yet — start one from Settings → Jobs → “Build Lineup with AI”.
          </p>
        )}
        <div className="divide-border divide-y">
        {runs.data?.map((r) => (
          <Link
            key={r.runId}
            to="/settings/workflows/ai-lineup/$runId"
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
                {r.steps.running > 0 && (
                  <span className="text-blue-600"> · {r.steps.running} running</span>
                )}
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
