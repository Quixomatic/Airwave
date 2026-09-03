/**
 * One AI lineup run, in full — the step timeline plus what the model actually THOUGHT.
 *
 * The list page answers "did it work and what did it cost". This answers "why did it decide
 * that", which is the question that actually drives prompt changes. Everything substantive here
 * comes from `AiLineupTrace`: the Workflow SDK records a channel build as one opaque step, so
 * the previews, the filter revisions and the reasoning inside it have no other home.
 *
 * The cost panel here is the HONEST one — grouped by model, including retries and the planner
 * call. The list page's figure is build-steps-only at worker rates, which once reported $0.16
 * for a run whose planner alone ran twice on Opus.
 *
 * Design goals (v0.12.x observability pass): render the whole structure IMMEDIATELY (skeletons
 * while loading, the shared EmptyState when genuinely empty), never a blank wait; visualize cost
 * as stacked token bars rather than a wall of numbers; render each build's agent loop as a
 * readable transcript instead of raw JSON; and merge a channel's retries into one card with an
 * attempt switcher rather than repeating the channel.
 */
import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@airwave/ui/components/collapsible";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@airwave/ui/components/frame";
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from "@airwave/ui/components/preview-card";
import { Skeleton } from "@airwave/ui/components/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@airwave/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock,
  Coins,
  CornerDownRight,
  Ban,
  Layers,
  Loader2,
  MessageSquareText,
  MinusCircle,
  RefreshCw,
  Tv,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { JsonView, darkStyles, defaultStyles } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";

import { Response } from "@/components/ai-elements/response";
import { EmptyState } from "@/components/empty-state";
import { useTheme } from "@/components/theme-provider";
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

/** Run statuses that mean the run is over — used to stop polling. Anything else counts as "live". */
const TERMINAL_RUN_STATUS = new Set(["completed", "failed", "cancelled", "aborted", "expired"]);

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

const PHASE_LABEL: Record<string, string> = {
  analyze: "Analyze",
  context: "Shared context",
  plan: "Plan",
  packages: "Packages",
  numbering: "Numbering",
  build: "Build",
  report: "Report",
};

/** Friendly label for a raw SDK step name (`analyzeLibrary` → "Analyze library"). */
function stepLabel(name: string): string {
  const map: Record<string, string> = {
    analyzeLibrary: "Analyze library",
    buildSharedContext: "Shared context",
    listExistingPackages: "Existing packages",
    planLineup: "Plan lineup",
    createPackages: "Create packages",
    assignNumbers: "Assign numbers",
    buildChannel: "Build channel",
    reportLineup: "Report",
  };
  return map[name] ?? name;
}

/** A run/step status → its icon + colour, with a live spinner for anything in flight. */
function StatusIcon({ status, className = "" }: { status: string; className?: string }) {
  const cls = `${className} shrink-0`;
  switch (status) {
    case "ok":
    case "completed":
      return <CheckCircle2 className={`${cls} text-emerald-600`} />;
    case "running":
      return <Loader2 className={`${cls} animate-spin text-blue-600`} />;
    case "skipped":
      return <MinusCircle className={`${cls} text-amber-600`} />;
    case "failed":
      return <XCircle className={`${cls} text-red-600`} />;
    case "cancelled":
      return <Ban className={`${cls} text-muted-foreground`} />;
    default:
      return <CircleDashed className={`${cls} text-muted-foreground`} />;
  }
}

const STATUS_TONE: Record<string, string> = {
  ok: "text-emerald-600",
  completed: "text-emerald-600",
  running: "text-blue-600",
  skipped: "text-amber-600",
  failed: "text-red-600",
  cancelled: "text-muted-foreground",
};

/**
 * Collapsible JSON, behind a label toggle so cards stay compact. When open it's an interactive,
 * per-node expand/collapse tree (react-json-view-lite), themed to match light/dark. A primitive
 * value (rare — most trace payloads are objects) falls back to plain text.
 */
function RawJson({
  label,
  value,
  defaultOpen = false,
}: {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  if (value == null) return null;
  const isTree = typeof value === "object";
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs">
        <ChevronRight
          className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {isTree ? (
          <div className="mt-1 max-h-96 overflow-auto rounded-md border p-2 text-xs [&_*]:font-mono">
            <JsonView
              data={value as object}
              // Expand only the top level by default; deeper nodes stay collapsed until clicked.
              shouldExpandNode={(level) => level < 1}
              style={resolvedTheme === "dark" ? darkStyles : defaultStyles}
            />
          </div>
        ) : (
          <pre className="bg-muted/50 mt-1 max-h-96 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
            {String(value)}
          </pre>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Agent transcript ------------------------------------------------------------------------

/** One entry in a build's `trace` array (see summarizeAgentSteps in channel-builder.ts). */
type TraceEntry =
  | { call: string; input?: unknown }
  | { result: string; matched?: number; sample?: string }
  | { says: string };

function isCall(e: TraceEntry): e is { call: string; input?: unknown } {
  return typeof (e as { call?: unknown }).call === "string";
}
function isResult(e: TraceEntry): e is { result: string; matched?: number; sample?: string } {
  return typeof (e as { result?: unknown }).result === "string";
}
function isSays(e: TraceEntry): e is { says: string } {
  return typeof (e as { says?: unknown }).says === "string";
}

/** Compact one-liner for a tool call's input — the fields that actually matter, not the blob. */
function summarizeInput(input: unknown): string | null {
  if (input == null || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const bits: string[] = [];
  if (Array.isArray(o.mediaTypes)) bits.push(o.mediaTypes.join(", "));
  if (typeof o.field === "string") bits.push(o.field);
  if (typeof o.poolSize === "number") bits.push(`pool ${o.poolSize}`);
  if (typeof o.reason === "string") bits.push(o.reason);
  if (typeof o.detail === "string") bits.push(o.detail);
  return bits.length ? bits.join(" · ") : null;
}

/** A tool call with its result(s) folded in, or a block of model reasoning — one node on the rail. */
type StepNode =
  | {
      kind: "tool";
      call: string;
      input?: unknown;
      results: { result: string; matched?: number; sample?: string }[];
    }
  | { kind: "text"; says: string };

/** Fold the flat trace into steps: each tool call is a step; its results attach to it; text stands alone. */
function buildNodes(entries: TraceEntry[]): StepNode[] {
  const nodes: StepNode[] = [];
  for (const e of entries) {
    if (isCall(e)) {
      nodes.push({ kind: "tool", call: e.call, input: e.input, results: [] });
    } else if (isResult(e)) {
      const last = nodes[nodes.length - 1];
      if (last && last.kind === "tool") {
        last.results.push({ result: e.result, matched: e.matched, sample: e.sample });
      } else {
        nodes.push({ kind: "tool", call: e.result, results: [{ result: e.result, matched: e.matched, sample: e.sample }] });
      }
    } else if (isSays(e)) {
      nodes.push({ kind: "text", says: e.says });
    }
  }
  return nodes;
}

/**
 * The agent loop as a numbered stepper: each tool call is a big numbered circle on a connecting
 * rail, its result folded in beneath it; model reasoning gets a message marker between steps.
 * Deliberately NOT muted — the transcript is the substance of the page, so it reads at full
 * contrast; muted is reserved for genuinely secondary bits (the input toggle, the raw sample).
 */
function AgentTranscript({ trace }: { trace: unknown }) {
  if (!Array.isArray(trace) || !trace.length) {
    return <p className="text-muted-foreground text-xs">No tool calls recorded.</p>;
  }
  const nodes = buildNodes(trace as TraceEntry[]);
  let stepNo = 0;
  return (
    <ol>
      {nodes.map((node, i) => {
        const last = i === nodes.length - 1;
        const isTool = node.kind === "tool";
        if (isTool) stepNo += 1;
        const sub = isTool ? summarizeInput(node.input) : null;
        return (
          <li key={i} className="flex gap-3">
            {/* Rail: the numbered circle, and a line that stretches to the next node. */}
            <div className="flex flex-col items-center">
              {isTool ? (
                <div className="bg-primary text-primary-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {stepNo}
                </div>
              ) : (
                <div className="bg-background text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">
                  <MessageSquareText className="h-3.5 w-3.5" />
                </div>
              )}
              {!last && <div className="bg-border mt-1 w-px flex-1" />}
            </div>

            {/* Content */}
            <div className={`min-w-0 flex-1 ${last ? "pb-1" : "pb-5"} pt-0.5`}>
              {node.kind === "tool" ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-sm font-semibold">{node.call}</span>
                    {sub && <span className="text-muted-foreground text-xs">{sub}</span>}
                  </div>
                  {node.input != null && <RawJson label="input" value={node.input} />}
                  {node.results.map((r, j) => (
                    <div key={j} className="flex items-start gap-1.5 text-sm">
                      <CornerDownRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="min-w-0">
                        {typeof r.matched === "number" ? (
                          <span>
                            matched <span className="font-semibold">{n(r.matched)}</span> items
                          </span>
                        ) : (
                          <span>{r.result}</span>
                        )}
                        {r.sample && (
                          <div className="text-muted-foreground mt-0.5 truncate font-mono text-xs">
                            {r.sample}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Response className="text-sm">{node.says}</Response>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---- Cost & token bars -----------------------------------------------------------------------

/** The four token buckets, in bar order — the single source of truth for segment colours + labels. */
const TOKEN_SEGMENTS = [
  { key: "uncached", color: "bg-sky-500", label: "input" },
  { key: "cacheRead", color: "bg-sky-300", label: "cache read" },
  { key: "cacheWrite", color: "bg-indigo-400", label: "cache write" },
  { key: "output", color: "bg-emerald-500", label: "output" },
] as const;

/**
 * One model×phase row as a stacked horizontal bar. The bar's TOTAL width is the row's token
 * total relative to the biggest row (so magnitudes compare at a glance); within it, segments
 * are uncached input · cache-read · cache-write · output. Hover a segment for its exact count;
 * the metrics beneath carry the matching colour swatch.
 */
function TokenBar({ row, max }: { row: UsageRow; max: number }) {
  const uncached = Math.max(0, row.inputTokens - row.cacheReadTokens - row.cacheWriteTokens);
  const values: Record<(typeof TOKEN_SEGMENTS)[number]["key"], number> = {
    uncached,
    cacheRead: row.cacheReadTokens,
    cacheWrite: row.cacheWriteTokens,
    output: row.outputTokens,
  };
  const total = uncached + row.cacheReadTokens + row.cacheWriteTokens + row.outputTokens;
  const widthPct = max > 0 ? (total / max) * 100 : 0;
  const cost = costOf(row);
  const segs = TOKEN_SEGMENTS.map((s) => ({ ...s, value: values[s.key] })).filter((s) => s.value > 0);
  return (
    <div className="space-y-1.5 rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <span className="font-mono font-medium">{row.model}</span>
        <Badge variant="outline">{PHASE_LABEL[row.phase] ?? row.phase}</Badge>
        <span className="text-muted-foreground">{row.calls} call(s)</span>
        <span className="ml-auto font-mono">
          {cost != null ? `$${cost.toFixed(3)}` : "unpriced"}
        </span>
      </div>
      <div
        className="bg-muted flex h-2.5 overflow-hidden rounded-full"
        style={{ width: `${Math.max(widthPct, 2)}%` }}
      >
        {segs.map((s) => (
          <Tooltip key={s.key}>
            <TooltipTrigger
              render={<div className={s.color} style={{ width: `${(s.value / total) * 100}%` }} />}
            />
            <TooltipContent>
              {s.label}: {n(s.value)}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
        {segs.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-sm ${s.color}`} />
            <span className="text-muted-foreground">
              {s.label} {n(s.value)}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** A headline stat tile for the summary strip. */
function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Coins;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
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

// ---- Attempt switcher (shared by build cards and the plan) -----------------------------------

/** A `‹ Attempt n / m ›` control, pinned top-right of a card's meta row. Shows the shown attempt's status. */
function AttemptSwitcher({
  idx,
  count,
  status,
  onChange,
}: {
  idx: number;
  count: number;
  status: string;
  onChange: (i: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        aria-label="Previous attempt"
        disabled={idx === 0}
        onClick={() => onChange(Math.max(0, idx - 1))}
        className="hover:bg-muted rounded-md p-0.5 disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="flex items-center gap-1 text-xs whitespace-nowrap">
        <StatusIcon status={status} className="h-3 w-3" />
        Attempt {idx + 1} / {count}
      </span>
      <button
        type="button"
        aria-label="Next attempt"
        disabled={idx === count - 1}
        onClick={() => onChange(Math.min(count - 1, idx + 1))}
        className="hover:bg-muted rounded-md p-0.5 disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ---- Build card (with attempt switcher) ------------------------------------------------------

type BuildTrace = {
  id: string;
  stepId: string | null;
  attempt: number;
  status: string;
  reason: string | null;
  channelNumber: number | null;
  channelName: string | null;
  agentSteps: number;
  inputTokens: number;
  outputTokens: number;
  input: unknown;
  output: unknown;
  trace: unknown;
  startedAt: string | Date;
  finishedAt: string | Date | null;
};

function durationSecs(start: string | Date, end: string | Date | null): number | null {
  if (!end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Number.isFinite(s) && Number.isFinite(e) ? Math.round((e - s) / 1000) : null;
}

/** Pool size from a build's committed output, when present. */
function poolOf(output: unknown): number | null {
  const o = output as { poolSize?: unknown } | null;
  return o && typeof o.poolSize === "number" ? o.poolSize : null;
}

/** Stable key for a channel's build group (used to merge attempts, and as the timeline jump target). */
function buildKey(b: { channelNumber: number | null; channelName: string | null; id: string }): string {
  return String(b.channelNumber ?? b.channelName ?? b.id);
}
/** A DOM-id-safe form of a build key, so the timeline can `scrollIntoView` the matching card. */
function buildDomId(key: string): string {
  return `build-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * One channel, with all of its attempts merged. A retry (or a duplicate build of the same
 * channel) is shown as an attempt switcher INSIDE the card rather than a second card — reading
 * "attempt 1 failed, attempt 2 committed" in one place is the whole point.
 */
function BuildCard({
  attempts,
  domId,
  open,
  onToggle,
}: {
  attempts: BuildTrace[];
  domId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const ordered = [...attempts].sort((a, b) => a.attempt - b.attempt);
  const terminal = ordered[ordered.length - 1];
  // Default to the LAST attempt — the one that actually settled the channel.
  const [idx, setIdx] = useState(ordered.length - 1);
  const current = ordered[Math.min(idx, ordered.length - 1)] ?? terminal;
  const pool = poolOf(current.output);
  const secs = durationSecs(current.startedAt, current.finishedAt);

  return (
    <Collapsible
      id={domId}
      open={open}
      onOpenChange={onToggle}
      className="scroll-mt-20 rounded-md border"
    >
      <CollapsibleTrigger className="hover:bg-muted/50 flex w-full items-center gap-3 p-3 text-left">
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        <StatusIcon status={terminal.status} className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="text-muted-foreground font-mono">{terminal.channelNumber ?? "—"}</span>{" "}
          {terminal.channelName ?? "(unnamed)"}
        </span>
        {ordered.length > 1 && (
          <Badge variant="outline" className="shrink-0 text-amber-600">
            {ordered.length} attempts
          </Badge>
        )}
        {pool != null && (
          <span className="text-muted-foreground shrink-0 text-xs">pool {n(pool)}</span>
        )}
        <span className="text-muted-foreground shrink-0 text-xs">{terminal.agentSteps} steps</span>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3 border-t p-3">
          {/* Meta as badges, with the attempt switcher (< Attempt n / m >) pinned top-right. */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className={STATUS_TONE[current.status] ?? ""}>
                {current.status}
              </Badge>
              <Badge variant="outline">{current.agentSteps} agent steps</Badge>
              <Badge variant="outline">{n(current.inputTokens)} in</Badge>
              <Badge variant="outline">{n(current.outputTokens)} out</Badge>
              {secs != null && <Badge variant="outline">{secs}s</Badge>}
              {pool != null && <Badge variant="outline">pool {n(pool)}</Badge>}
            </div>
            {ordered.length > 1 && (
              <AttemptSwitcher
                idx={idx}
                count={ordered.length}
                status={current.status}
                onChange={setIdx}
              />
            )}
          </div>

          {current.reason && (
            <div>
              <p className="mb-1 text-xs font-medium">Model's reasoning</p>
              <Response className="text-xs text-muted-foreground">{current.reason}</Response>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium">Agent transcript — what it previewed and how it revised</p>
            <AgentTranscript trace={current.trace} />
          </div>

          <div className="space-y-1">
            <RawJson label="Brief & proposed filter (input)" value={current.input} defaultOpen />
            <RawJson label="Outcome (output)" value={current.output} defaultOpen />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Plan packages --------------------------------------------------------------------------

type PlanChannel = {
  number?: number | null;
  name?: string;
  description?: string;
  theme?: string;
};
type PlanPackage = { name?: string; description?: string; channels?: PlanChannel[] };

function planPackages(output: unknown): PlanPackage[] {
  const o = output as { packages?: PlanPackage[] } | null;
  return Array.isArray(o?.packages) ? (o.packages as PlanPackage[]) : [];
}

/** One planned package as a hovercard tile — the tile shows the summary, hover reveals the channels. */
function PlanPackageCard({ pkg }: { pkg: PlanPackage }) {
  const channels = pkg.channels ?? [];
  const name = pkg.name ?? "(unnamed package)";
  return (
    <PreviewCard>
      <PreviewCardTrigger
        render={
          <div className="hover:border-foreground/20 hover:bg-muted/40 flex h-full min-h-28 cursor-default flex-col gap-2 rounded-md border p-3 transition-colors" />
        }
      >
        <div className="flex items-start gap-2">
          <Layers className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 text-sm leading-tight font-medium">{name}</span>
        </div>
        {pkg.description && <p className="text-muted-foreground line-clamp-2 text-xs">{pkg.description}</p>}
        <div className="mt-auto">
          <Badge variant="outline">
            {channels.length} channel{channels.length === 1 ? "" : "s"}
          </Badge>
        </div>
      </PreviewCardTrigger>
      <PreviewCardPopup className="w-72">
        <div className="w-full min-w-0 space-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <Layers className="text-muted-foreground h-4 w-4 shrink-0" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</p>
            <Badge variant="outline" className="shrink-0">
              {channels.length}
            </Badge>
          </div>
          {pkg.description && <p className="text-muted-foreground text-xs">{pkg.description}</p>}
          <div className="-mx-1 max-h-64 space-y-1 overflow-y-auto px-1">
            {channels.length === 0 && <p className="text-muted-foreground text-xs">No channels.</p>}
            {channels.map((c, i) => (
              <div key={i} className="flex min-w-0 items-start gap-1.5">
                {c.number != null && (
                  <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                    {c.number}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs">{c.name ?? "(unnamed)"}</p>
                  {(c.theme || c.description) && (
                    <p className="text-muted-foreground truncate text-[11px]">{c.theme ?? c.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PreviewCardPopup>
    </PreviewCard>
  );
}

type PlanAttempt = {
  status: string;
  model: string | null;
  attempt: number;
  inputTokens: number;
  outputTokens: number;
  output: unknown;
  startedAt: string | Date;
  finishedAt: string | Date | null;
};

/**
 * The plan, with retries merged — same shell as a channel-build card: a meta badge row with an
 * attempt switcher pinned top-right, then the planned packages/channels and the raw plan JSON.
 * Defaults to the last SUCCESSFUL attempt (the plan that actually drove the build).
 */
function PlanSection({ attempts }: { attempts: PlanAttempt[] }) {
  const ordered = [...attempts].sort((a, b) => a.attempt - b.attempt);
  const lastOk = ordered.reduce((acc, a, i) => (a.status === "ok" ? i : acc), -1);
  const [idx, setIdx] = useState(lastOk >= 0 ? lastOk : ordered.length - 1);
  const current = ordered[Math.min(idx, ordered.length - 1)];
  const pkgs = planPackages(current.output);
  const channelCount = pkgs.reduce((s, p) => s + (p.channels?.length ?? 0), 0);
  const secs = durationSecs(current.startedAt, current.finishedAt);

  return (
    <Frame>
      <FrameHeader className="flex-row items-center gap-2">
        <FrameTitle className="text-sm">The plan</FrameTitle>
        <Badge variant="outline">
          {pkgs.length} package{pkgs.length === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline">{channelCount} channels</Badge>
      </FrameHeader>
      <FramePanel className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={STATUS_TONE[current.status] ?? ""}>
              {current.status === "ok" ? "planned" : current.status}
            </Badge>
            {current.model && (
              <Badge variant="outline" className="font-mono">
                {current.model}
              </Badge>
            )}
            <Badge variant="outline">{n(current.inputTokens)} in</Badge>
            <Badge variant="outline">{n(current.outputTokens)} out</Badge>
            {secs != null && <Badge variant="outline">{secs}s</Badge>}
          </div>
          {ordered.length > 1 && (
            <AttemptSwitcher
              idx={idx}
              count={ordered.length}
              status={current.status}
              onChange={setIdx}
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {pkgs.map((pkg, i) => (
            <PlanPackageCard key={i} pkg={pkg} />
          ))}
        </div>
        <RawJson label="Full plan JSON — every package, channel and filter" value={current.output} />
      </FramePanel>
    </Frame>
  );
}

// ---- Page ------------------------------------------------------------------------------------

function RunDetail() {
  const { runId } = Route.useParams();

  // The authoritative run status + return value. Only `plan`/`build` phases write trace rows, so the
  // report (which carries `dryRun`) and the overall status live on the run itself, not in a trace.
  // It polls on its OWN status until the run is terminal — the source of truth for liveness below.
  const run = useQuery({
    ...trpc.ai.lineupRun.queryOptions({ runId }),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s && TERMINAL_RUN_STATUS.has(s) ? false : 3000;
    },
    retry: false,
  });
  // Liveness is derived from the RUN status, not step status. Between the plan step finishing and the
  // build steps starting, NO step is "running" — step-based liveness stopped polling in that gap, so a
  // manual refresh was needed to notice the builds start. The run stays "running" across that gap.
  // Until the first status lands, assume live (poll); a query error (e.g. engine off) stops polling.
  const isLive = run.isError ? false : !(run.data?.status != null && TERMINAL_RUN_STATUS.has(run.data.status));

  // Plain boolean rather than a `refetchInterval` callback: the callback's query generic, applied to a
  // row type carrying Json columns, tips TS into TS2589 ("type instantiation is excessively deep").
  const steps = useQuery({
    ...trpc.ai.lineupRunSteps.queryOptions({ runId }),
    refetchInterval: isLive ? 3000 : false,
  });
  const traces = useQuery({
    ...trpc.ai.lineupRunTraces.queryOptions({ runId }),
    refetchInterval: isLive ? 3000 : false,
  });
  const usage = useQuery({
    ...trpc.ai.lineupRunUsage.queryOptions({ runId }),
    refetchInterval: isLive ? 5000 : false,
  });

  const rows = (usage.data ?? []) as UsageRow[];
  const known = rows.filter((r) => costOf(r) != null);
  const totalCost = known.reduce((sum, r) => sum + (costOf(r) ?? 0), 0);
  const unpriced = rows.length - known.length;
  const maxTokens = Math.max(
    1,
    ...rows.map(
      (r) =>
        Math.max(0, r.inputTokens - r.cacheReadTokens - r.cacheWriteTokens) +
        r.cacheReadTokens +
        r.cacheWriteTokens +
        r.outputTokens,
    ),
  );
  const totalIn = rows.reduce((s, r) => s + r.inputTokens, 0);
  const totalOut = rows.reduce((s, r) => s + r.outputTokens, 0);

  const all = traces.data ?? [];
  const planAttempts = all.filter((t) => t.phase === "plan") as unknown as PlanAttempt[];
  const buildRows = all.filter((t) => t.phase === "build") as unknown as BuildTrace[];
  // Plan attempts (incl. failed retries) live in their own section now; everything non-build,
  // non-plan lands here (analyze, context, packages, numbering, report).
  const others = all.filter((t) => t.phase !== "build" && t.phase !== "plan");
  // Dry run (#22): the report is the run's RETURN VALUE (there is no `report` trace phase), plus each
  // dry-run build tags its input, so a preview shows the badge live too — not only once it finishes.
  const report = run.data?.output as
    | {
        dryRun?: boolean;
        channelsPlanned?: number;
        channelsCreated?: number;
        packagesCreated?: number;
        skipped?: unknown[];
        failed?: unknown[];
      }
    | null
    | undefined;
  const isDryRun =
    Boolean(report?.dryRun) ||
    all.some((t) => Boolean((t.input as { dryRun?: boolean } | null)?.dryRun));

  // Overall run status for the header badge. `run.data.status` is authoritative; fall back to the
  // step list (any running → running; otherwise completed once steps exist).
  const runStatus =
    run.data?.status ?? (isLive ? "running" : (steps.data?.length ?? 0) > 0 ? "completed" : null);

  // Merge builds by channel so retries/duplicates collapse into one card with an attempt switcher.
  const buildGroups = new Map<string, BuildTrace[]>();
  for (const b of buildRows) {
    const key = buildKey(b);
    const arr = buildGroups.get(key) ?? [];
    arr.push(b);
    buildGroups.set(key, arr);
  }
  const groups = [...buildGroups.values()].sort(
    (a, b) => (a[0].channelNumber ?? 0) - (b[0].channelNumber ?? 0),
  );
  const createdCount = groups.filter((g) => g.some((a) => a.status === "ok")).length;
  const skippedCount = groups.filter(
    (g) => !g.some((a) => a.status === "ok") && g.some((a) => a.status === "skipped"),
  ).length;
  const failedCount = groups.filter((g) => g.every((a) => a.status === "failed")).length;

  // Correlate the SDK step list with build traces (by stepId) so the timeline can name channels.
  const channelByStep = new Map<string, BuildTrace>();
  for (const b of buildRows) if (b.stepId) channelByStep.set(b.stepId, b);
  const timeline = steps.data ?? [];

  // Live builds: a `buildChannel` step whose trace hasn't landed yet (the trace row — with the whole
  // transcript — is written only when the step finishes). Show a placeholder so an in-flight build is
  // visible in real time rather than popping in fully-formed at the end. A retry keeps its earlier
  // attempt's trace, so those are already represented as a card and excluded here.
  const tracedStepIds = new Set(buildRows.map((b) => b.stepId).filter(Boolean));
  const runningBuilds = timeline.filter(
    (s) => s.name === "buildChannel" && s.status === "running" && !tracedStepIds.has(s.stepId),
  );
  const maxStepSecs = Math.max(1, ...timeline.map((s) => s.durationSeconds ?? 0));

  // Run-level duration: earliest step start → latest completion (or "running" if any are live).
  const startTimes = timeline.map((s) => (s.startedAt ? new Date(s.startedAt).getTime() : NaN)).filter(Number.isFinite);
  const endTimes = timeline.map((s) => (s.completedAt ? new Date(s.completedAt).getTime() : NaN)).filter(Number.isFinite);
  const runSecs =
    startTimes.length && endTimes.length ? Math.round((Math.max(...endTimes) - Math.min(...startTimes)) / 1000) : null;
  const plannerStep = timeline.find((s) => s.name === "planLineup");

  const anyLoading = steps.isLoading || traces.isLoading || usage.isLoading;
  const nothingYet = !anyLoading && !timeline.length && !all.length && !rows.length;

  const refetchAll = () => {
    void steps.refetch();
    void traces.refetch();
    void usage.refetch();
  };

  // Timeline → jump-to. Clicking a step scrolls to (and, for builds, opens) the thing it produced.
  // Single-open accordion: only one channel build is expanded at a time.
  const [openBuild, setOpenBuild] = useState<string | null>(null);
  const toggleBuild = (key: string) => setOpenBuild((prev) => (prev === key ? null : key));
  const scrollToId = (id: string) =>
    requestAnimationFrame(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  const jumpToStep = (stepName: string, stepId: string) => {
    if (stepName === "buildChannel") {
      const ch = channelByStep.get(stepId);
      if (!ch) return;
      const key = buildKey(ch);
      setOpenBuild(key);
      scrollToId(buildDomId(key));
    } else if (stepName === "planLineup") {
      scrollToId("plan-section");
    } else {
      scrollToId("other-steps");
    }
  };
  // Which step names actually have somewhere to jump to (so the row only looks clickable when it is).
  const stepHasTarget = (stepName: string, stepId: string) =>
    stepName === "buildChannel"
      ? channelByStep.has(stepId)
      : stepName === "planLineup"
        ? planAttempts.length > 0
        : others.length > 0;

  return (
    <div className="space-y-4 pb-24">
      {/* Header + summary. Rendered immediately; the stat tiles fill in as data lands. */}
      <Frame>
        <FrameHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            {isLive && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
            <FrameTitle className="font-mono text-sm">{runId}</FrameTitle>
            {runStatus && (
              <Badge variant="outline" className={STATUS_TONE[runStatus] ?? ""}>
                {runStatus[0].toUpperCase() + runStatus.slice(1)}
              </Badge>
            )}
            {isDryRun && (
              <Badge variant="outline">{isLive ? "Dry run" : "Dry run — created nothing"}</Badge>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={refetchAll} disabled={traces.isFetching}>
            {traces.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </FrameHeader>
        <FramePanel className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {anyLoading && !rows.length ? (
              <>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[58px] w-full" />
                ))}
              </>
            ) : (
              <>
                <StatTile
                  icon={Coins}
                  label="Cost"
                  value={rows.length ? `$${totalCost.toFixed(2)}` : "—"}
                  sub={unpriced ? `${unpriced} unpriced excluded` : "all models priced"}
                />
                <StatTile
                  icon={Layers}
                  label="Tokens"
                  value={`${n(totalIn)} in`}
                  sub={`${n(totalOut)} out`}
                />
                <StatTile
                  icon={Clock}
                  label="Duration"
                  value={runSecs != null ? `${runSecs}s` : isLive ? "running…" : "—"}
                  sub={plannerStep?.durationSeconds != null ? `planner ${plannerStep.durationSeconds}s` : undefined}
                />
                <StatTile
                  icon={Tv}
                  label={isDryRun ? "Would build" : "Channels"}
                  value={
                    <span className="flex items-center gap-1.5">
                      <span className="text-emerald-600">{createdCount}</span>
                      {skippedCount > 0 && <span className="text-amber-600">· {skippedCount}</span>}
                      {failedCount > 0 && <span className="text-red-600">· {failedCount}</span>}
                    </span>
                  }
                  sub={
                    report?.channelsPlanned != null
                      ? `of ${report.channelsPlanned} planned`
                      : `${groups.length} attempted`
                  }
                />
              </>
            )}
          </div>

          {/* The honest cost: every model, every phase, every ATTEMPT — as stacked token bars. */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Cost by model &amp; phase</p>
            {usage.isLoading && !rows.length && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[64px] w-full" />
                ))}
              </div>
            )}
            {!usage.isLoading && !rows.length && (
              <p className="text-muted-foreground text-sm">
                {isLive ? "Cost appears as each step completes…" : "No trace rows — this run predates v0.5.43."}
              </p>
            )}
            <TooltipProvider>
              <div className="space-y-2">
                {rows.map((r) => (
                  <TokenBar key={`${r.model}-${r.phase}`} row={r} max={maxTokens} />
                ))}
              </div>
            </TooltipProvider>
            {!!rows.length && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm font-medium">
                <span>Total{unpriced ? ` (${unpriced} unpriced model(s) excluded)` : ""}</span>
                <span className="font-mono">${totalCost.toFixed(2)}</span>
              </div>
            )}
          </div>
        </FramePanel>
      </Frame>

      {/* Whole-run empty state — only when there is genuinely nothing to show. */}
      {nothingYet && (
        <Frame>
          <FramePanel>
            <EmptyState
              icon={CircleDashed}
              title="No run data yet"
              description="This run has no recorded steps or traces. If it was just triggered, it'll appear here as the first step starts. Older runs may predate trace recording."
            />
          </FramePanel>
        </Frame>
      )}

      {/* THE PLAN — the run's most valuable artifact, and previously discarded entirely for any
          channel that a build cap meant we never constructed. The frame renders even before the
          plan step finishes, showing a loading state while the planner works. */}
      {planAttempts.length > 0 ? (
        <div id="plan-section" className="scroll-mt-20">
          <PlanSection attempts={planAttempts} />
        </div>
      ) : isLive || plannerStep ? (
        <Frame id="plan-section" className="scroll-mt-20">
          <FrameHeader>
            <FrameTitle className="text-sm">The plan</FrameTitle>
          </FrameHeader>
          <FramePanel className="space-y-3">
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Planning the lineup… this is one large model call
              and can take a while.
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          </FramePanel>
        </Frame>
      ) : null}

      {/* THE FAN-OUT. Expandable rather than tabbed so two channels' reasoning can be read side
          by side — comparing them is how a prompt problem becomes obvious. */}
      <Frame>
        <FrameHeader>
          <FrameTitle className="text-sm">Channel builds ({groups.length})</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-2">
          {/* Skeletons while there are no builds yet AND the run is still working (loading, or planning —
              the builds haven't started). Only fall through to the empty state once the run is over. */}
          {!groups.length && !runningBuilds.length && (traces.isLoading || isLive) && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[52px] w-full" />
              ))}
            </div>
          )}
          {!traces.isLoading && !isLive && !groups.length && !runningBuilds.length && (
            <EmptyState
              icon={Tv}
              title="No channel builds"
              description="No per-channel build traces were recorded for this run."
            />
          )}
          {/* Live builds whose trace hasn't landed yet — a placeholder so an in-flight build is visible. */}
          {runningBuilds.map((s) => (
            <div key={s.stepId} className="flex items-center gap-3 rounded-md border border-dashed p-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
              <span className="min-w-0 flex-1 text-sm">Building a channel…</span>
              {s.startedAt && (
                <span className="text-muted-foreground shrink-0 text-xs">
                  {Math.max(0, Math.round((Date.now() - new Date(s.startedAt).getTime()) / 1000))}s
                </span>
              )}
            </div>
          ))}
          {groups.map((g) => {
            const key = buildKey(g[0]);
            return (
              <BuildCard
                key={g[0].id}
                attempts={g}
                domId={buildDomId(key)}
                open={openBuild === key}
                onToggle={() => toggleBuild(key)}
              />
            );
          })}
        </FramePanel>
      </Frame>

      {/* Everything else that traced (failed plan attempts included). */}
      {!!others.length && (
        <Frame id="other-steps" className="scroll-mt-20">
          <FrameHeader>
            <FrameTitle className="text-sm">Other steps ({others.length})</FrameTitle>
          </FrameHeader>
          <FramePanel className="space-y-2">
            {others.map((t) => (
              <div key={t.id} className="rounded-md border">
                <div className="flex items-center gap-3 p-2 text-xs">
                  <StatusIcon status={t.status} className="h-3.5 w-3.5" />
                  <span className="flex-1 truncate">{stepLabel(t.stepName)}</span>
                  {t.attempt > 1 && <span className="text-amber-600">attempt {t.attempt}</span>}
                </div>
                {(t.error || t.output != null) && (
                  <div className="space-y-2 border-t p-3">
                    {t.error && <p className="text-xs text-red-600">{t.error}</p>}
                    <RawJson label="output" value={t.output} />
                  </div>
                )}
              </div>
            ))}
          </FramePanel>
        </Frame>
      )}

      {/* The SDK's outside view — durations and retries per step, with a proportional bar and, for
          builds, the channel the step was for (correlated by stepId). */}
      <Frame>
        <FrameHeader>
          <FrameTitle className="text-sm">Step timeline ({timeline.length})</FrameTitle>
        </FrameHeader>
        <FramePanel className="space-y-1">
          {steps.isLoading && !timeline.length && (
            <div className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          )}
          {!steps.isLoading && !timeline.length && (
            <EmptyState
              icon={CircleDashed}
              title="No steps yet"
              description="Steps appear here the moment the run starts executing."
            />
          )}
          {timeline.map((s) => {
            const ch = channelByStep.get(s.stepId);
            const widthPct = s.durationSeconds != null ? (s.durationSeconds / maxStepSecs) * 100 : 0;
            const hasTarget = stepHasTarget(s.name, s.stepId);
            return (
              <button
                key={s.stepId}
                type="button"
                disabled={!hasTarget}
                onClick={() => jumpToStep(s.name, s.stepId)}
                title={hasTarget ? "Jump to this step's detail" : undefined}
                className={`flex w-full items-center gap-3 rounded-md border px-3 py-1.5 text-left text-xs ${
                  hasTarget ? "hover:bg-muted/50 cursor-pointer" : "cursor-default"
                }`}
              >
                <StatusIcon status={s.status} className="h-3.5 w-3.5" />
                <span className="w-32 shrink-0 truncate font-medium">{stepLabel(s.name)}</span>
                <span className="text-muted-foreground min-w-0 flex-1 truncate">
                  {ch ? (
                    <>
                      <span className="font-mono">{ch.channelNumber ?? "—"}</span> {ch.channelName}
                    </>
                  ) : (
                    ""
                  )}
                </span>
                {s.attempt > 1 && <span className="shrink-0 text-amber-600">attempt {s.attempt}</span>}
                <div className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-muted sm:block">
                  <div
                    className={`h-full ${s.status === "failed" ? "bg-red-400" : "bg-blue-400"}`}
                    style={{ width: `${Math.max(widthPct, s.durationSeconds ? 4 : 0)}%` }}
                  />
                </div>
                <span className="text-muted-foreground w-12 shrink-0 text-right">
                  {s.status === "running" ? (
                    <Loader2 className="ml-auto h-3 w-3 animate-spin" />
                  ) : s.durationSeconds != null ? (
                    `${s.durationSeconds}s`
                  ) : (
                    "—"
                  )}
                </span>
              </button>
            );
          })}
        </FramePanel>
      </Frame>
    </div>
  );
}
