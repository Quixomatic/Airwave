import { Button } from "@ChannelGuide/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@ChannelGuide/ui/components/preview-card";
import { Switch } from "@ChannelGuide/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Loader2, PackageCheck, X } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";

import { getStagedImport, type ImportPreview } from "@/features/transfer/staging";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/settings/transfer/import-preview")({
  staticData: { breadcrumb: "Import preview" },
  component: ImportPreviewPage,
});

type Pkg = ImportPreview["packages"][number];
type Ch = Pkg["channels"][number];

function ImportPreviewPage() {
  const navigate = useNavigate();
  const staged = getStagedImport();
  const preview = staged?.preview ?? null;

  // Default selection = everything EXCEPT exact duplicates (already imported → skipped anyway), so a
  // re-import of the same file is opt-in per channel rather than a wall of no-ops.
  const defaultSelected = useMemo(() => {
    const s = new Set<number>();
    if (preview) {
      for (const p of preview.packages) for (const c of p.channels) if (!c.duplicate) s.add(c.number);
      for (const c of preview.ungrouped) if (!c.duplicate) s.add(c.number);
    }
    return s;
  }, [preview]);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(defaultSelected));

  // Direct nav / hard refresh loses the staged file — send them back to upload.
  if (!staged || !preview) return <Navigate to="/settings/transfer" />;

  const toggle = (n: number) =>
    setSelected((prev) => {
      const x = new Set(prev);
      if (x.has(n)) x.delete(n);
      else x.add(n);
      return x;
    });
  // Duplicates can't be selected (they're skipped on import regardless), so package-level select-all
  // operates only on the selectable (non-duplicate) channels.
  const allSel = (chs: Ch[]) => {
    const sel = chs.filter((c) => !c.duplicate);
    return sel.length > 0 && sel.every((c) => selected.has(c.number));
  };
  const togglePkg = (chs: Ch[]) =>
    setSelected((prev) => {
      const x = new Set(prev);
      const sel = chs.filter((c) => !c.duplicate);
      if (allSel(chs)) for (const c of sel) x.delete(c.number);
      else for (const c of sel) x.add(c.number);
      return x;
    });

  const groups: { key: string; name: string; exists?: boolean; channels: Ch[] }[] = [
    ...preview.packages.map((p) => ({ key: p.key, name: p.name, exists: p.exists, channels: p.channels })),
    ...(preview.ungrouped.length ? [{ key: "__ungrouped__", name: "Ungrouped", channels: preview.ungrouped }] : []),
  ];
  const selectedCount = selected.size;
  const sourceReady = !!preview.source?.ready;

  const [dryRun, setDryRun] = useState(false);
  const [starting, setStarting] = useState(false);
  const engine = useQuery(trpc.transfer.importAvailable.queryOptions());
  const engineReady = engine.data?.available ?? false;

  const handleImport = async () => {
    setStarting(true);
    try {
      const { runId } = await trpcClient.transfer.import.mutate({
        data: staged.data as never,
        selectedNumbers: [...selected],
        targetSourceId: staged.targetSourceId,
        dryRun,
      });
      toast.success(dryRun ? "Dry run started — nothing will be imported." : "Import started.");
      void navigate({ to: "/settings/workflows/import/$runId", params: { runId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the import.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Frame>
      {/* Sticky action header — stays put (with the Import button) while the package grid scrolls. The
          negative margins bleed it to the Frame's edges so scrolling tiles don't peek past its sides. */}
      <FrameHeader className="bg-muted border-border sticky top-0 z-20 -mx-2 -mt-2 rounded-t-2xl border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <FrameTitle>Import lineup</FrameTitle>
            <FrameDescription className="truncate">
              <span className="text-foreground font-medium">{staged.fileName}</span> →{" "}
              <span className="text-foreground font-medium">{staged.targetName}</span> · {preview.totals.packages}{" "}
              packages · {preview.totals.channels} channels · {selectedCount} selected
              {preview.totals.duplicates > 0 ? ` · ${preview.totals.duplicates} already imported` : ""}
            </FrameDescription>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="text-muted-foreground flex items-center gap-2 text-sm" title="Validate + resolve + preview for real, but write nothing.">
              <Switch checked={dryRun} onCheckedChange={setDryRun} aria-label="Dry run" />
              Dry run
            </label>
            <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/settings/transfer" })}>
              <X className="mr-2 size-4" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={selectedCount === 0 || !sourceReady || !engineReady || starting}
            >
              {starting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PackageCheck className="mr-2 size-4" />}
              {dryRun ? "Dry run" : "Import"} {selectedCount} {selectedCount === 1 ? "channel" : "channels"}
            </Button>
          </div>
        </div>
      </FrameHeader>

      {!preview.supported && (
        <Banner>
          This file was exported by a newer version of Airwave (format v{preview.version}); some fields may not
          import cleanly.
        </Banner>
      )}
      {!sourceReady && (
        <Banner>
          {staged.targetName} isn't ready yet — connect it to a media server and run a metadata sync before
          importing.
        </Banner>
      )}
      {!engine.isLoading && !engineReady && (
        <Banner>
          The import workflow engine isn't running on this instance (WORKFLOW_ENABLED is off), so imports can't
          be started here.
        </Banner>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <FramePanel key={g.key} className="divide-border divide-y p-0">
            <div className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{g.name}</p>
                <p className="text-muted-foreground text-xs">
                  {g.channels.length} {g.channels.length === 1 ? "channel" : "channels"}
                  {g.exists ? " · already here" : ""}
                </p>
              </div>
              <Switch
                checked={allSel(g.channels)}
                onCheckedChange={() => togglePkg(g.channels)}
                disabled={!g.channels.some((c) => !c.duplicate)}
                aria-label={`Select all in ${g.name}`}
              />
            </div>
            {g.channels.length === 0 ? (
              <p className="text-muted-foreground p-4 text-sm">No channels.</p>
            ) : (
              g.channels.map((c) => (
                <ChannelRow key={c.number} c={c} checked={selected.has(c.number)} onToggle={() => toggle(c.number)} />
              ))
            )}
          </FramePanel>
        ))}
      </div>
    </Frame>
  );
}

function ChannelRow({ c, checked, onToggle }: { c: Ch; checked: boolean; onToggle: () => void }) {
  const issues: string[] = [];
  if (c.duplicate)
    issues.push("An identical channel already exists here — it'll be skipped even if selected (idempotent re-import).");
  if (c.willBeDisabled) issues.push("No portable filter — it'll import disabled (nothing to schedule).");
  if (c.droppedKinds.length)
    issues.push(`Drops ${[...new Set(c.droppedKinds)].join(", ").toLowerCase()} from the filter (per-server, not portable).`);
  if (c.numberInUse)
    issues.push(`Channel number ${c.number} is already in use here — it'll be reassigned to the next free number.`);
  if (c.libraryUnmatched)
    issues.push("A filter targets a library this instance doesn't have — it'll search all libraries instead.");

  return (
    <div className={`flex items-center gap-3 p-3${c.duplicate ? " opacity-60" : ""}`}>
      <Switch
        checked={checked}
        onCheckedChange={onToggle}
        disabled={c.duplicate}
        aria-label={`Import ${c.name}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="text-muted-foreground tabular-nums">{c.number}</span> {c.name}
          {c.callsign ? <span className="text-muted-foreground"> · {c.callsign}</span> : null}
        </p>
      </div>
      {c.duplicate && (
        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
          Already imported
        </span>
      )}
      {issues.length > 0 && (
        <HoverCard>
          <HoverCardTrigger render={<button type="button" className="text-amber-500" aria-label="Import warnings" />}>
            <AlertTriangle className="size-4" />
          </HoverCardTrigger>
          <HoverCardContent className="w-72">
            <ul className="list-disc space-y-1 pl-4 text-xs">
              {issues.map((i, k) => (
                <li key={k}>{i}</li>
              ))}
            </ul>
          </HoverCardContent>
        </HoverCard>
      )}
    </div>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
