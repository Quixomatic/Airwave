/**
 * The workflows index — one card per durable workflow, linking to its runs.
 *
 * There's only the AI lineup builder today, but this is the landing spot for the settings
 * "Workflows" tab and the natural home for any future durable workflow (a scheduled rebuild,
 * a bulk re-resolve, etc.), so it's a list rather than a redirect.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Workflow } from "lucide-react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/workflows/")({
  component: WorkflowsIndex,
});

function WorkflowsIndex() {
  // Just for the run-count subtitle; the engine may also be off (self-hosted without WDK).
  const runs = useQuery(trpc.ai.lineupRuns.queryOptions({ limit: 100 }));
  const runCount = runs.data?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workflows</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Link
          to="/settings/workflows/ai-lineup"
          className="hover:bg-muted/50 flex items-center gap-3 rounded-md border p-3"
        >
          <span className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-md">
            <Workflow className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">AI Lineup</div>
            <div className="text-muted-foreground text-xs">
              Analyse the library, design a full lineup, and build it — runs and cost
              {runCount > 0 ? ` · ${runCount} run${runCount === 1 ? "" : "s"}` : ""}
            </div>
          </div>
          <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
        </Link>
      </CardContent>
    </Card>
  );
}
