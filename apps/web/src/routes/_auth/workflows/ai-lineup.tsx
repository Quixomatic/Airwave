/**
 * AI lineup runs — the index. Each row links to that run's own page.
 *
 * Deliberately its own section rather than living under /channels: this is about the WORKFLOW,
 * not the channels it happens to create.
 *
 * Detail deliberately does NOT live here. A run's substance — the full plan, and every
 * channel build's tool calls and reasoning — is far more than a list row can hold, so it
 * moved to `/workflows/ai-lineup/$runId` (v0.5.44). This page stays a scannable index of
 * what ran, when, and how far it got.
 */
import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Loader2, RefreshCw } from "lucide-react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/workflows/ai-lineup")({
  staticData: { breadcrumb: "AI Lineup" },
  component: AiLineupRuns,
});

const STATUS_TONE: Record<string, string> = {
  completed: "text-emerald-600",
  running: "text-blue-600",
  failed: "text-red-600",
  cancelled: "text-muted-foreground",
};

function AiLineupRuns() {
  // Poll while anything is in flight so a live run updates without a manual refresh.
  const runs = useQuery({
    ...trpc.ai.lineupRuns.queryOptions({ limit: 20 }),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === "running") ? 3000 : false),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>AI lineup runs</CardTitle>
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
      </CardHeader>
      <CardContent className="space-y-2">
        {runs.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {runs.data?.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No runs yet — start one from Settings → Jobs → “Build Lineup with AI”.
          </p>
        )}
        {runs.data?.map((r) => (
          <Link
            key={r.runId}
            to="/workflows/ai-lineup/$runId"
            params={{ runId: r.runId }}
            className="hover:bg-muted/50 flex w-full items-center gap-3 rounded-md border p-3 text-left"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${STATUS_TONE[r.status] ?? ""}`}>
                  {r.status}
                </span>
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
      </CardContent>
    </Card>
  );
}
