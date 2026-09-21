import { AccentIconTile } from "@airwave/ui/components/accent-icon-tile";
import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@airwave/ui/components/preview-card";
import { Switch } from "@airwave/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Blocks, Check, Eye, Loader2, PackageCheck, Tv, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ChannelPreviewTiles, type ChannelPreviewData } from "@/features/channels/channel-preview";
import { resolveTile } from "@/features/icons/app-icon";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/preset/new")({
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
  useEffect(() => () => void (alive.current = false), []);

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
          const r = await trpcClient.preset.preview.query({ channelKey: k, sourceId });
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
      const all = new Set<string>();
      for (const p of catalog.data.packages) for (const c of p.channels) all.add(c.key);
      setEnabled(all);
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
      await trpcClient.preset.build.mutate({ selection: { channelKeys: [...enabled] } });
      toast.success("Preset build started.");
      void navigate({ to: "/channels" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the build.");
    } finally {
      setSubmitting(false);
    }
  };

  const stepIndex = reviewing || submitting ? 2 : previewMode ? 1 : 0;

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
    <Frame>
      {confirmDialog}
      <FrameHeader className="bg-muted border-border sticky top-0 z-20 -mx-2 -mt-2 space-y-3 rounded-t-2xl border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <FrameTitle>Preset generator</FrameTitle>
            <FrameDescription>
              {totals.selected} of {totals.channels} channels selected across {packages.length} packages.
              {previewMode ? " Toggle any channel to resolve it live." : " Pick what you want, then preview."}
            </FrameDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/channels" })}>
              <X className="mr-2 size-4" /> Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPreviewMode(true)} disabled={previewMode || totals.selected === 0}>
              <Eye className="mr-2 size-4" />
              {previewMode ? "Live preview on" : "Preview"}
            </Button>
            <Button size="sm" onClick={onSubmit} disabled={totals.selected === 0 || submitting}>
              {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PackageCheck className="mr-2 size-4" />}
              Submit
            </Button>
          </div>
        </div>
        <Stepper index={stepIndex} />
      </FrameHeader>

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
  );
}

const STEPS = ["Select", "Preview", "Review & build"];

/** A compact horizontal 1-2-3 progress stepper. */
function Stepper({ index }: { index: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs">
      {STEPS.map((label, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                "flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold " +
                (done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground")
              }
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={active ? "text-foreground font-medium" : "text-muted-foreground"}>{label}</span>
            {i < STEPS.length - 1 && <span className="bg-border mx-1 h-px w-6" />}
          </li>
        );
      })}
    </ol>
  );
}

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
        />
      ))}
    </FramePanel>
  );
}

function ChannelRow({
  ch,
  sourceId,
  on,
  onToggle,
  previewMode,
  entry,
}: {
  ch: CatalogChannel;
  sourceId: string;
  on: boolean;
  onToggle: () => void;
  previewMode: boolean;
  entry?: PreviewEntry;
}) {
  const badge = diffBadge(ch.exists, ch.presetChanged, on);
  return (
    <div className={"flex items-center gap-3 p-3" + (on ? "" : " opacity-60")}>
      <Switch checked={on} onCheckedChange={onToggle} aria-label={`Toggle ${ch.name}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="text-muted-foreground tabular-nums">{ch.number}</span> {ch.name}
          {ch.callsign ? <span className="text-muted-foreground"> · {ch.callsign}</span> : null}
        </p>
      </div>
      {badge && (
        <span className={"shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " + badge.cls}>{badge.label}</span>
      )}
      {previewMode && on && <PreviewCount ch={ch} sourceId={sourceId} entry={entry} />}
    </div>
  );
}

function PreviewCount({ ch, sourceId, entry }: { ch: CatalogChannel; sourceId: string; entry?: PreviewEntry }) {
  if (!entry || entry.status === "loading") {
    return <Loader2 className="text-muted-foreground size-3.5 shrink-0 animate-spin" />;
  }
  if (entry.status === "error") {
    return <span className="text-destructive shrink-0 text-[10px]">failed</span>;
  }
  const count = entry.count ?? 0;
  // A NEW channel under its min-items floor will be skipped on build; flag it.
  const willSkip = !ch.exists && entry.minItems != null && count < entry.minItems;
  const data: ChannelPreviewData = {
    totalItems: count,
    showCount: entry.showCount ?? 0,
    movieCount: entry.movieCount ?? 0,
    items: entry.items ?? [],
  };
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            type="button"
            className={"shrink-0 text-xs tabular-nums " + (willSkip ? "text-amber-500" : "text-muted-foreground")}
            title={willSkip ? `Below the ${entry.minItems}-item minimum — will be skipped` : undefined}
          />
        }
      >
        {count.toLocaleString()}
      </HoverCardTrigger>
      <HoverCardContent className="w-96">
        <ChannelPreviewTiles sourceId={sourceId} data={data} />
      </HoverCardContent>
    </HoverCard>
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

/** The net-outcome summary shown in the confirm dialog. */
function NetOutcome({ plan }: { plan: PlanResult }) {
  const { counts } = plan;
  const line = (n: number, verb: string) => (n === 1 ? `${n} channel to ${verb}` : `${n} channels to ${verb}`);
  return (
    <div className="space-y-2 text-sm">
      <p>
        This will <strong className="text-green-600 dark:text-green-400">{line(counts.create, "create")}</strong>,{" "}
        <strong className="text-amber-600 dark:text-amber-400">{line(counts.update, "update")}</strong>, and{" "}
        <strong className="text-red-600 dark:text-red-400">{line(counts.delete, "delete")}</strong>.{" "}
        <span className="text-muted-foreground">{counts.unchanged} left unchanged.</span>
      </p>
      {counts.delete > 0 && (
        <div className="text-muted-foreground max-h-32 overflow-y-auto text-xs">
          <p className="text-foreground font-medium">Deleting:</p>
          <ul className="list-disc pl-4">
            {plan.delete.map((d) => (
              <li key={d.channelKey}>
                {d.channelName} <span className="opacity-70">({d.packageName})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
