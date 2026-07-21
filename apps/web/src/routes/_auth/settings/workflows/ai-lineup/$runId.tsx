/**
 * One AI lineup run, in full — the step timeline plus what the model actually THOUGHT.
 *
 * The list page answers "did it work and what did it cost". This answers "why did it decide
 * that", which is the question that actually drives prompt changes. Everything here comes from
 * `AiLineupTrace`: the Workflow SDK records a channel build as one opaque step, so the
 * previews, the filter revisions and the reasoning inside it have no other home.
 *
 * The cost panel here is the HONEST one — grouped by model, including retries and the planner
 * call. The list page's figure is build-steps-only at worker rates, which once reported $0.16
 * for a run whose planner alone ran twice on Opus.
 */
import { Badge } from "@ChannelGuide/ui/components/badge";
import { Button } from "@ChannelGuide/ui/components/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@ChannelGuide/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/workflows/ai-lineup/$runId")({
  staticData: { breadcrumb: "Run" },
  component: RunDetail,
});

/** $/MTok. Cache reads bill ~0.1x and writes ~1.25x, which is why they're tracked separately. */
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-opus-4-7": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-fable-5": { in: 10, out: 50 },
};

const n = (v: number) => v.toLocaleString();

type UsageRow = {
  model: string;
  phase: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  agentSteps: number;
};

/**
 * Resolve a model string to a rate, tolerating DATED ids.
 *
 * A connection's model is whatever the provider's API expects, which for Anthropic is often
 * a dated variant — `claude-haiku-4-5-20251001` rather than `claude-haiku-4-5`. Exact-match
 * lookup missed those and reported an entire run's build spend as "unpriced". Longest-prefix
 * match handles the date suffix without pretending to know models we genuinely don't.
 */
function rateFor(model: string) {
  const exact = PRICING[model];
  if (exact) return exact;
  const key = Object.keys(PRICING)
    .filter((k) => model.startsWith(k))
    // Longest wins, so `claude-opus-4-8...` can't be captured by a shorter overlapping key.
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICING[key] : undefined;
}

/**
 * Per-model cost. Genuinely unknown models yield `null` rather than a guess — a made-up
 * number here is worse than an obvious gap, since the whole point of this panel is that the
 * previous estimate was quietly wrong.
 */
function costOf(u: UsageRow): number | null {
  const rate = rateFor(u.model);
  if (!rate) return null;
  const uncached = Math.max(0, u.inputTokens - u.cacheReadTokens - u.cacheWriteTokens);
  return (
    (uncached * rate.in + u.cacheWriteTokens * rate.in * 1.25 + u.cacheReadTokens * rate.in * 0.1) /
      1_000_000 +
    (u.outputTokens * rate.out) / 1_000_000
  );
}

const STATUS_TONE: Record<string, string> = {
  ok: "text-emerald-600",
  completed: "text-emerald-600",
  running: "text-blue-600",
  skipped: "text-amber-600",
  failed: "text-red-600",
  cancelled: "text-muted-foreground",
};

const PHASE_LABEL: Record<string, string> = {
  analyze: "Analyze",
  context: "Shared context",
  plan: "Plan",
  packages: "Packages",
  numbering: "Numbering",
  build: "Build",
  report: "Report",
};

function Json({ value }: { value: unknown }) {
  if (value == null) return null;
  return (
    <pre className="bg-muted/50 max-h-96 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function RunDetail() {
  const { runId } = Route.useParams();
  const [open, setOpen] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Poll while the run is live so traces appear as each step finishes.
  const steps = useQuery({
    ...trpc.ai.lineupRunSteps.queryOptions({ runId }),
    refetchInterval: (q) => ((q.state.data ?? []).some((s) => s.status === "running") ? 3000 : false),
  });
  // Plain boolean rather than a `refetchInterval` callback: the callback's query generic,
  // applied to a row type carrying Json columns, tips TS into TS2589 ("type instantiation is
  // excessively deep"). Deriving liveness from the steps query sidesteps it entirely.
  const isLive = (steps.data ?? []).some((s) => s.status === "running");
  const traces = useQuery({
    ...trpc.ai.lineupRunTraces.queryOptions({ runId }),
    refetchInterval: isLive ? 3000 : false,
  });
  const usage = useQuery(trpc.ai.lineupRunUsage.queryOptions({ runId }));

  const rows = (usage.data ?? []) as UsageRow[];
  const known = rows.filter((r) => costOf(r) != null);
  const total = known.reduce((sum, r) => sum + (costOf(r) ?? 0), 0);
  const unpriced = rows.length - known.length;

  const all = traces.data ?? [];
  const plan = all.find((t) => t.phase === "plan" && t.status === "ok");
  const builds = all.filter((t) => t.phase === "build");
  const others = all.filter((t) => t.phase !== "build" && t !== plan);

  return (
    <div className="space-y-4">
      <Frame>
        <FrameHeader className="flex-row items-center justify-between">
          <FrameTitle className="font-mono text-sm">{runId}</FrameTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void traces.refetch();
              void steps.refetch();
              void usage.refetch();
            }}
            disabled={traces.isFetching}
          >
            {traces.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </FrameHeader>
        <FramePanel className="space-y-3">
          {/* The honest cost: every model, every phase, every ATTEMPT. */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Cost by model &amp; phase</p>
            {usage.isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
            {!usage.isLoading && !rows.length && (
              <p className="text-muted-foreground text-sm">
                No trace rows — this run predates v0.5.43.
              </p>
            )}
            {rows.map((r) => (
              <div
                key={`${r.model}-${r.phase}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3 py-2 text-xs"
              >
                <span className="font-mono font-medium">{r.model}</span>
                <Badge variant="outline">{PHASE_LABEL[r.phase] ?? r.phase}</Badge>
                <span className="text-muted-foreground">{r.calls} call(s)</span>
                <span>in {n(r.inputTokens)}</span>
                <span>out {n(r.outputTokens)}</span>
                <span className="text-muted-foreground">
                  cache r{n(r.cacheReadTokens)} / w{n(r.cacheWriteTokens)}
                </span>
                <span className="ml-auto font-mono">
                  {costOf(r) != null ? `$${costOf(r)!.toFixed(3)}` : "unpriced"}
                </span>
              </div>
            ))}
            {!!rows.length && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium">
                <span>Total{unpriced ? ` (${unpriced} unpriced model(s) excluded)` : ""}</span>
                <span className="font-mono">${total.toFixed(2)}</span>
              </div>
            )}
          </div>
        </FramePanel>
      </Frame>

      {/* THE PLAN — the run's most valuable artifact, and previously discarded entirely for
          any channel that a build cap meant we never constructed. */}
      {plan && (
        <Frame>
          <FrameHeader>
            <FrameTitle className="text-sm">The plan</FrameTitle>
          </FrameHeader>
          <FramePanel className="space-y-2">
            <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
              <span>{n(plan.inputTokens)} in</span>
              <span>{n(plan.outputTokens)} out</span>
              <span>attempt {plan.attempt}</span>
              {plan.model && <span className="font-mono">{plan.model}</span>}
            </div>
            <button
              type="button"
              onClick={() => toggle(plan.id)}
              className="hover:bg-muted/50 flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm"
            >
              {open.has(plan.id) ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Full plan JSON — every package, channel and filter
            </button>
            {open.has(plan.id) && <Json value={plan.output} />}
          </FramePanel>
        </Frame>
      )}

      {/* THE FAN-OUT. Expandable rather than tabbed so two channels' reasoning can be read
          side by side — comparing them is how a prompt problem becomes obvious. */}
      <Frame>
        <FrameHeader>
          <FrameTitle className="text-sm">Channel builds ({builds.length})</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-2">
          {!builds.length && (
            <p className="text-muted-foreground text-sm">No build traces recorded.</p>
          )}
          {builds.map((b) => (
            <div key={b.id} className="rounded-md border">
              <button
                type="button"
                onClick={() => toggle(b.id)}
                className="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left"
              >
                {open.has(b.id) ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )}
                <span className={`w-16 shrink-0 text-xs font-medium ${STATUS_TONE[b.status] ?? ""}`}>
                  {b.status}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {b.channelNumber} {b.channelName}
                </span>
                {b.attempt > 1 && (
                  <span className="shrink-0 text-xs text-amber-600">attempt {b.attempt}</span>
                )}
                <span className="text-muted-foreground shrink-0 text-xs">
                  {b.agentSteps} steps · {n(b.inputTokens)} in
                </span>
              </button>
              {open.has(b.id) && (
                <div className="space-y-3 border-t p-3">
                  {b.reason && (
                    <div>
                      <p className="mb-1 text-xs font-medium">Model's reasoning</p>
                      <p className="text-muted-foreground text-xs whitespace-pre-wrap">{b.reason}</p>
                    </div>
                  )}
                  <div>
                    <p className="mb-1 text-xs font-medium">Brief &amp; proposed filter</p>
                    <Json value={b.input} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium">
                      Tool calls — what it previewed and how it revised
                    </p>
                    <Json value={b.trace} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium">Outcome</p>
                    <Json value={b.output} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </FramePanel>
      </Frame>

      {/* Everything else that traced (failed plan attempts included). */}
      {!!others.length && (
        <Frame>
          <FrameHeader>
            <FrameTitle className="text-sm">Other steps ({others.length})</FrameTitle>
          </FrameHeader>
          <FramePanel className="space-y-2">
            {others.map((t) => (
              <div key={t.id} className="rounded-md border">
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  className="hover:bg-muted/50 flex w-full items-center gap-3 p-2 text-left text-xs"
                >
                  {open.has(t.id) ? (
                    <ChevronDown className="h-4 w-4 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  )}
                  <span className={`w-16 shrink-0 font-medium ${STATUS_TONE[t.status] ?? ""}`}>
                    {t.status}
                  </span>
                  <span className="flex-1 truncate">{t.stepName}</span>
                  {t.attempt > 1 && <span className="text-amber-600">attempt {t.attempt}</span>}
                </button>
                {open.has(t.id) && (
                  <div className="space-y-2 border-t p-3">
                    {t.error && <p className="text-xs text-red-600">{t.error}</p>}
                    <Json value={t.output} />
                  </div>
                )}
              </div>
            ))}
          </FramePanel>
        </Frame>
      )}

      {/* The SDK's outside view — durations and retries per step. */}
      <Frame>
        <FrameHeader>
          <FrameTitle className="text-sm">Step timeline ({steps.data?.length ?? 0})</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-1">
          {steps.data?.map((s) => (
            <div
              key={s.stepId}
              className="flex items-center gap-3 rounded-md border px-3 py-1.5 text-xs"
            >
              <span className={`w-20 shrink-0 font-medium ${STATUS_TONE[s.status] ?? ""}`}>
                {s.status}
              </span>
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
