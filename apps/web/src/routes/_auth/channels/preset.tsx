import { AccentIconTile } from "@airwave/ui/components/accent-icon-tile";
import { Button } from "@airwave/ui/components/button";
import { Frame, FramePanel } from "@airwave/ui/components/frame";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@airwave/ui/components/stepper";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@airwave/ui/components/preview-card";
import { Switch } from "@airwave/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Blocks, CheckIcon, Eye, Loader2, LoaderCircleIcon, PackageCheck, Tv, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { HeaderCenter, HeaderLeft, HeaderRight } from "@/context/header-provider";
import { ChannelPreviewTiles, PreviewSkeleton } from "@/features/channels/channel-preview";
import { resolveTile } from "@/features/icons/app-icon";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/channels/preset")({
  staticData: { breadcrumb: "Preset generator" },
  component: PresetStagingPage,
});

type CatalogPackage = Awaited<ReturnType<typeof trpcClient.preset.catalog.query>>["packages"][number];
type CatalogChannel = CatalogPackage["channels"][number];
type PlanResult = Awaited<ReturnType<typeof trpcClient.preset.plan.query>>;

type PreviewEntry = {
  status: "loading" | "done" | "error";
  count?: number;
  showCount?: number;
  movieCount?: number;
  items?: ChannelPreviewData["items"];
  minItems?: number;
  error?: string;
};

/**
 * Bounded, cached per-channel preview resolver. Dormant until `active` (the user hit Preview); then it
 * resolves each enabled channel exactly once (bounded concurrency), caching the result so toggling a
 * channel off and back on is instant, and toggling more on only resolves the newly-enabled ones.
 */
function usePresetPreviews(sourceId: string | undefined, active: boolean, enabledKeys: string[]) {
  const [map, setMap] = useState<Record<string, PreviewEntry>>({});
  const seen = useRef(new Set<string>());
  const alive = useRef(true);
  // Set true on (re)mount, false on unmount. Must reset to true on remount, or React StrictMode's
  // dev mount→unmount→remount leaves it stuck false and every result is silently dropped (perma-spinner).
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const enabledKey = enabledKeys.join(",");
  useEffect(() => {
    if (!active || !sourceId) return;
    const todo = enabledKeys.filter((k) => !seen.current.has(k));
    if (todo.length === 0) return;
    for (const k of todo) seen.current.add(k);
    setMap((m) => {
      const n = { ...m };
      for (const k of todo) n[k] = { status: "loading" };
      return n;
    });
    let i = 0;
    const CONCURRENCY = 5;
    const worker = async () => {
      while (i < todo.length) {
        const k = todo[i++]!;
        try {
          // skipBatch: each preview is its own HTTP request, so the bounded pool truly streams — one slow
          // filter occupies a single slot instead of stalling a whole batch (httpBatchLink resolves a batch
          // atomically, which would defeat the sliding window).
          const r = await trpcClient.preset.preview.query(
            { channelKey: k, sourceId },
            { context: { skipBatch: true } },
          );
          if (alive.current) setMap((m) => ({ ...m, [k]: { status: "done", ...r } }));
        } catch (e) {
          if (alive.current)
            setMap((m) => ({ ...m, [k]: { status: "error", error: e instanceof Error ? e.message : String(e) } }));
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sourceId, enabledKey]);

  return map;
}

function PresetStagingPage() {
  const navigate = useNavigate();
  const catalog = useQuery(trpc.preset.catalog.queryOptions());
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Selection = enabled channel keys. Seeded to "everything on" once the catalog loads, so nothing gets
  // removed by default and turning a channel off is a deliberate act.
  const [enabled, setEnabled] = useState<Set<string> | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (catalog.data && enabled === null) {
      // Default ON: the Basic package, plus any channels that already exist (a previously-generated lineup),
      // so a re-run preserves what you built and only Basic is opt-in for a first run.
      const seed = new Set<string>();
      for (const p of catalog.data.packages) for (const c of p.channels) {
        if (p.key === "basic" || c.exists) seed.add(c.key);
      }
      setEnabled(seed);
    }
  }, [catalog.data, enabled]);

  const enabledKeys = useMemo(() => (enabled ? [...enabled] : []), [enabled]);
  const previews = usePresetPreviews(catalog.data?.sourceId, previewMode, enabledKeys);

  const toggle = (key: string) =>
    setEnabled((prev) => {
      const x = new Set(prev);
      if (x.has(key)) x.delete(key);
      else x.add(key);
      return x;
    });

  const togglePackage = (channels: CatalogChannel[]) =>
    setEnabled((prev) => {
      const x = new Set(prev);
      const allOn = channels.every((c) => x.has(c.key));
      if (allOn) for (const c of channels) x.delete(c.key);
      else for (const c of channels) x.add(c.key);
      return x;
    });

  const isOn = (key: string) => enabled?.has(key) ?? false;

  const totals = useMemo(() => {
    if (!catalog.data) return { channels: 0, selected: 0 };
    let channels = 0;
    for (const p of catalog.data.packages) channels += p.channels.length;
    return { channels, selected: enabled?.size ?? 0 };
  }, [catalog.data, enabled]);

  const onSubmit = async () => {
    if (!enabled || enabled.size === 0) return;
    let plan: PlanResult;
    try {
      plan = await trpcClient.preset.plan.query({ selection: { channelKeys: [...enabled] } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't compute the plan.");
      return;
    }
    setReviewing(true);
    const ok = await confirm({
      title: "Apply these changes?",
      body: <NetOutcome plan={plan} />,
      confirmLabel: `Build`,
      destructive: plan.counts.delete > 0,
    });
    setReviewing(false);
    if (!ok) return;

    setSubmitting(true);
    try {
      const { runId } = await trpcClient.preset.build.mutate({ selection: { channelKeys: [...enabled] } });
      toast.success("Preset build started.");
      void navigate({ to: "/settings/preset-runs/$runId", params: { runId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the build.");
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = reviewing || submitting ? 2 : previewMode ? 1 : 0;
  const stepValue = stepIndex + 1;
  const previewBusy = previewMode && Object.values(previews).some((e) => e.status === "loading");
  const busyStep = submitting ? 3 : previewBusy ? 2 : 0;

  if (catalog.isLoading || !catalog.data || !enabled) {
    return (
      <Frame>
        <FramePanel className="flex items-center justify-center py-16">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </FramePanel>
      </Frame>
    );
  }

  if (catalog.isError) {
    return (
      <Frame>
        <FramePanel>
          <EmptyState icon={X} title="Couldn't load the preset catalog" description="Connect a media source and try again." />
        </FramePanel>
      </Frame>
    );
  }

  const packages = catalog.data.packages;

  return (
    <>
      {confirmDialog}
      <HeaderLeft>
        <p className="text-sm">
          <span className="text-foreground font-medium tabular-nums">{totals.selected}</span>
          <span className="text-muted-foreground">
            {" "}
            of {totals.channels} channels · {packages.length} packages
          </span>
        </p>
      </HeaderLeft>
      <HeaderCenter>
        <Stepper
          value={stepValue}
          className="w-full"
          indicators={{
            completed: <CheckIcon className="size-3.5" />,
            loading: <LoaderCircleIcon className="size-3.5 animate-spin" />,
          }}
        >
          <StepperNav>
            {STEPS.map((label, i) => {
              const step = i + 1;
              return (
                <StepperItem key={label} step={step} loading={step === busyStep} className="not-last:flex-1">
                  <StepperTrigger className="cursor-default">
                    <StepperIndicator className="data-[state=completed]:bg-green-500 data-[state=completed]:text-white">
                      {step}
                    </StepperIndicator>
                    <StepperTitle className="data-[state=inactive]:text-muted-foreground data-[state=inactive]:font-normal">
                      {label}
                    </StepperTitle>
                  </StepperTrigger>
                  {i < STEPS.length - 1 && (
                    <StepperSeparator className="data-[state=completed]:bg-green-500" />
                  )}
                </StepperItem>
              );
            })}
          </StepperNav>
        </Stepper>
      </HeaderCenter>
      <HeaderRight>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewMode(true)}
            disabled={previewMode || totals.selected === 0}
          >
            <Eye className="mr-2 size-4" />
            {previewMode ? "Live preview on" : "Preview"}
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={totals.selected === 0 || submitting}>
            {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PackageCheck className="mr-2 size-4" />}
            Submit
          </Button>
        </div>
      </HeaderRight>

      <Frame>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <PackageCard
              key={pkg.key}
              pkg={pkg}
              sourceId={catalog.data.sourceId}
              isOn={isOn}
              onToggleChannel={toggle}
              onTogglePackage={() => togglePackage(pkg.channels)}
              previewMode={previewMode}
              previews={previews}
            />
          ))}
        </div>
      </Frame>
    </>
  );
}

const STEPS = ["Select", "Preview", "Review & build"];

function PackageCard({
  pkg,
  sourceId,
  isOn,
  onToggleChannel,
  onTogglePackage,
  previewMode,
  previews,
}: {
  pkg: CatalogPackage;
  sourceId: string;
  isOn: (key: string) => boolean;
  onToggleChannel: (key: string) => void;
  onTogglePackage: () => void;
  previewMode: boolean;
  previews: Record<string, PreviewEntry>;
}) {
  const tile = resolveTile({ icon: pkg.icon, tint: pkg.tint, defaultIcon: Blocks });
  const onCount = pkg.channels.filter((c) => isOn(c.key)).length;
  const allOn = onCount === pkg.channels.length;

  return (
    <FramePanel className="divide-border divide-y p-0">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <AccentIconTile icon={tile.Icon} tint={tile.tint} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-medium">{pkg.name}</p>
            <p className="text-muted-foreground text-xs">
              {pkg.description}
              <span className="tabular-nums"> · {onCount}/{pkg.channels.length} on</span>
            </p>
          </div>
        </div>
        <Switch
          checked={allOn}
          onCheckedChange={onTogglePackage}
          aria-label={`Toggle all in ${pkg.name}`}
        />
      </div>
      {pkg.channels.map((ch) => (
        <ChannelRow
          key={ch.key}
          ch={ch}
          sourceId={sourceId}
          on={isOn(ch.key)}
          onToggle={() => onToggleChannel(ch.key)}
          previewMode={previewMode}
          entry={previews[ch.key]}
          inheritedIcon={pkg.icon}
          inheritedTint={pkg.tint}
        />
      ))}
    </FramePanel>
  );
}

/** A fixed, larger-poster grid for the hovercard (the shared tiles' default grid is viewport-responsive,
 *  which renders tiny cramped tiles inside a fixed-width card). */
const HOVER_GRID = "grid grid-cols-4 gap-3";

function ChannelRow({
  ch,
  sourceId,
  on,
  onToggle,
  previewMode,
  entry,
  inheritedIcon,
  inheritedTint,
}: {
  ch: CatalogChannel;
  sourceId: string;
  on: boolean;
  onToggle: () => void;
  previewMode: boolean;
  entry?: PreviewEntry;
  inheritedIcon?: string | null;
  inheritedTint?: string | null;
}) {
  // Once a NEW channel's preview resolves below its min-items floor, the build will skip it — surface that as
  // a "Skip" badge (overriding "New") so the outcome is unmistakable before submit.
  const willSkip =
    on && !ch.exists && entry?.status === "done" && entry.minItems != null && (entry.count ?? 0) < entry.minItems;
  const badge = willSkip
    ? { label: "Skip", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" }
    : diffBadge(ch.exists, ch.presetChanged, on);
  const tile = resolveTile({ icon: ch.icon, tint: ch.tint, inheritedIcon, inheritedTint, defaultIcon: Tv });

  const rowBody = (
    <div
      className={"hover:bg-muted/50 flex items-start gap-3 p-3 transition-colors" + (on ? "" : " opacity-60")}
    >
      <Switch checked={on} onCheckedChange={onToggle} className="mt-0.5" aria-label={`Toggle ${ch.name}`} />
      <div className="min-w-0 flex-1">
        {/* Row 1: number + name + callsign, with the diff badge pinned right (never shifts). */}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">
            <span className="text-muted-foreground tabular-nums">{ch.number}</span> {ch.name}
            {ch.callsign ? <span className="text-muted-foreground font-normal"> · {ch.callsign}</span> : null}
          </p>
          {badge && (
            <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " + badge.cls}>
              {badge.label}
            </span>
          )}
        </div>
        {/* Row 2: truncated description, with the resolved count / spinner pinned right. */}
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className="text-muted-foreground truncate text-xs">{ch.description}</p>
          {previewMode && on && <PreviewMetric ch={ch} entry={entry} />}
        </div>
      </div>
    </div>
  );

  // No hovercard for a disabled channel — it isn't being previewed, so there's nothing to show.
  if (!on) return rowBody;

  return (
    <HoverCard>
      <HoverCardTrigger delay={100} render={<div />}>
        {rowBody}
      </HoverCardTrigger>
      <HoverCardContent className="flex w-[34rem] flex-col p-0">
        {/* Header: tinted tile + name/description. */}
        <div className={"flex shrink-0 items-center gap-3 p-4" + (previewMode ? " border-b" : "")}>
          <AccentIconTile icon={tile.Icon} tint={tile.tint} size="xl" />
          <div className="min-w-0">
            <p className="truncate font-medium">{ch.name}</p>
            <p className="text-muted-foreground text-xs">{ch.description}</p>
          </div>
        </div>
        {/* Scrollable preview tiles — only once we're actually previewing (nothing resolves before that). */}
        {previewMode && (
          <div className="p-4">
            {entry?.status === "done" ? (
              <ChannelPreviewTiles
                sourceId={sourceId}
                gridClassName={HOVER_GRID}
                data={{
                  totalItems: entry.count ?? 0,
                  showCount: entry.showCount ?? 0,
                  movieCount: entry.movieCount ?? 0,
                  items: entry.items ?? [],
                }}
              />
            ) : (
              <PreviewSkeleton count={8} gridClassName={HOVER_GRID} />
            )}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

/** Row-2 metric: a spinner while resolving, then the exact count (amber if it will be skipped). */
function PreviewMetric({ ch, entry }: { ch: CatalogChannel; entry?: PreviewEntry }) {
  if (!entry || entry.status === "loading") {
    return <Loader2 className="text-muted-foreground size-3.5 shrink-0 animate-spin" />;
  }
  if (entry.status === "error") {
    return <span className="text-destructive shrink-0 text-[10px]">failed</span>;
  }
  const count = entry.count ?? 0;
  const willSkip = !ch.exists && entry.minItems != null && count < entry.minItems;
  return (
    <span
      className={"shrink-0 text-xs tabular-nums " + (willSkip ? "text-amber-500" : "text-muted-foreground")}
      title={willSkip ? `Below the ${entry.minItems}-item minimum — will be skipped` : undefined}
    >
      {count.toLocaleString()}
    </span>
  );
}

/** The New/Update/Unchanged/Remove pill classes, from the channel's diff state crossed with its toggle. */
function diffBadge(exists: boolean, presetChanged: boolean, on: boolean): { label: string; cls: string } | null {
  if (on && !exists) return { label: "New", cls: "bg-green-500/15 text-green-600 dark:text-green-400" };
  if (on && exists && presetChanged) return { label: "Update", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };
  if (on && exists) return { label: "Unchanged", cls: "bg-muted text-muted-foreground" };
  if (!on && exists) return { label: "Remove", cls: "bg-red-500/15 text-red-600 dark:text-red-400" };
  return null;
}

/** The net-outcome breakdown shown in the confirm dialog: a labeled section per op with a count badge and
 *  the affected channels listed beneath it. */
function NetOutcome({ plan }: { plan: PlanResult }) {
  const groups = [
    { label: "Will create", items: plan.create, cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
    { label: "Will update", items: plan.update, cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
    { label: "Will delete", items: plan.delete, cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
  ];
  return (
    <div className="max-h-[24rem] space-y-3 overflow-y-auto pr-1">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-medium">{g.label}</span>
            <span className={"rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums " + g.cls}>
              {g.items.length}
            </span>
          </div>
          {g.items.length > 0 ? (
            <ul className="space-y-0.5 pl-0.5 text-xs">
              {g.items.map((c) => (
                <li key={c.channelKey} className="truncate">
                  <span className="text-muted-foreground tabular-nums">{c.number}</span> {c.channelName}
                  <span className="text-muted-foreground"> · {c.packageName}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground pl-0.5 text-xs">None</p>
          )}
        </div>
      ))}
      {plan.counts.unchanged > 0 && (
        <p className="text-muted-foreground border-t pt-2 text-xs">
          {plan.counts.unchanged} unchanged, left as-is.
        </p>
      )}
    </div>
  );
}
