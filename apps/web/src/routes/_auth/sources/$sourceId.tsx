import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { Input } from "@airwave/ui/components/input";
import { Label } from "@airwave/ui/components/label";
import { Switch } from "@airwave/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { useBreadcrumb } from "@/context/breadcrumb-provider";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/sources/$sourceId")({
  staticData: { breadcrumb: "Source" },
  component: SourceDetail,
});

function SourceDetail() {
  const { sourceId } = Route.useParams();
  const navigate = useNavigate();
  const source = useQuery(trpc.sources.get.queryOptions({ id: sourceId }));
  useBreadcrumb(source.data?.name);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [name, setName] = useState("");
  const [rescanning, setRescanning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // The metadata sync runs as a background job; poll it for live status/progress.
  const jobs = useQuery({ ...trpc.jobs.list.queryOptions(), refetchInterval: 2000 });
  const syncJob = jobs.data?.find((j) => j.id === "metadata-sync");
  const syncing = syncJob?.running ?? false;

  useEffect(() => {
    if (source.data) setName(source.data.name);
  }, [source.data]);

  const saveName = async () => {
    try {
      await trpcClient.sources.updateLabel.mutate({ id: sourceId, name });
      toast.success("Renamed.");
      await source.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const rescan = async () => {
    setRescanning(true);
    try {
      await trpcClient.sources.rescan.mutate({ id: sourceId });
      toast.success("Libraries rescanned.");
      await source.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rescan failed");
    } finally {
      setRescanning(false);
    }
  };

  const syncMetadata = async () => {
    try {
      await trpcClient.jobs.run.mutate({ id: "metadata-sync" });
      toast.success("Metadata sync started.");
      await jobs.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start metadata sync");
    }
  };

  const toggleLibrary = async (libraryId: string, enabled: boolean) => {
    try {
      await trpcClient.sources.setLibraryEnabled.mutate({ libraryId, enabled });
      await source.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove “${source.data?.name ?? "this source"}”?`,
      description: (
        <>
          This permanently deletes the source and <strong>everything built from it</strong>: all its
          channels, their schedules, and cached metadata. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete source",
      destructive: true,
      challenge: {
        match: "DELETE",
        label: (
          <>
            Type <span className="text-foreground font-mono font-semibold">DELETE</span> to confirm
          </>
        ),
      },
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await trpcClient.sources.remove.mutate({ id: sourceId });
      toast.success("Source removed.");
      navigate({ to: "/sources" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
      setDeleting(false);
    }
  };

  if (!source.data) {
    return <div className="text-muted-foreground mx-auto max-w-3xl text-sm">Loading…</div>;
  }

  const src = source.data;
  // `syncing` (from the live metadata-sync job) covers a re-sync of an already-synced source too, since its
  // persisted syncStatus stays "synced" during routine refreshes.
  const isSyncing = syncing || src.syncing;
  const statusBadge = !src.connected ? (
    <Badge variant="outline" className="border-red-500/30 text-red-600">
      Disconnected
    </Badge>
  ) : isSyncing ? (
    <Badge variant="outline" className="border-sky-500/30 text-sky-600">
      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      Syncing
    </Badge>
  ) : src.synced ? (
    <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">
      Ready
    </Badge>
  ) : src.failed ? (
    <Badge variant="outline" className="border-red-500/30 text-red-600">
      Sync failed
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-500/30 text-amber-600">
      Not synced
    </Badge>
  );

  return (
    <div className="space-y-6">
      {confirmDialog}
      <Frame>
        <FrameHeader className="flex-row items-start justify-between">
          <div>
            <FrameTitle>Connection</FrameTitle>
            <FrameDescription>How this media server is labelled and reached.</FrameDescription>
          </div>
          {statusBadge}
        </FrameHeader>
        <FramePanel className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Label</Label>
            <div className="flex gap-2">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              <Button
                variant="outline"
                onClick={saveName}
                disabled={!name.trim() || name === source.data.name}
              >
                Save
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground text-xs">
            {source.data.baseUrl} · {source.data.machineIdentifier}
          </p>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader className="flex-row items-center justify-between">
          <div>
            <FrameTitle>Libraries</FrameTitle>
            <FrameDescription>Which libraries Airwave builds channels from.</FrameDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={syncMetadata} disabled={syncing}>
              {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {syncing ? "Syncing…" : "Sync metadata"}
            </Button>
            <Button variant="outline" size="sm" onClick={rescan} disabled={rescanning}>
              {rescanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Rescan
            </Button>
          </div>
        </FrameHeader>
        {syncing && <SyncProgress progress={syncJob?.progress ?? null} />}
        <FramePanel className="p-0">
          <ul className="divide-y">
            {source.data.libraries.map((lib) => (
              <li key={lib.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{lib.title}</p>
                  <p className="text-muted-foreground text-xs capitalize">{lib.type}</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={lib.enabled}
                    onCheckedChange={(v) => toggleLibrary(lib.id, v === true)}
                  />
                  Enabled
                </label>
              </li>
            ))}
            {source.data.libraries.length === 0 && (
              <li className="text-muted-foreground px-4 py-6 text-center text-sm">
                No libraries — try Rescan.
              </li>
            )}
          </ul>
        </FramePanel>
      </Frame>

      {/* Danger zone — a distinct destructive-tinted section (à la GitHub's repo settings) so a
          cascade-delete is never a one-tap mistake. The actual confirm is the type-DELETE modal. */}
      <Frame>
        <FrameHeader>
          <FrameTitle className="text-destructive">Danger zone</FrameTitle>
          <FrameDescription>Irreversible actions — there's no undo.</FrameDescription>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Remove this source</p>
            <p className="text-muted-foreground text-sm">
              Permanently deletes the source and <strong>everything built from it</strong> — every
              channel, their schedules, and all cached metadata. This <strong>cannot be undone</strong>.
            </p>
          </div>
          <Button variant="destructive" className="shrink-0" onClick={remove} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Remove source
          </Button>
        </FramePanel>
      </Frame>
    </div>
  );
}

function SyncProgress({
  progress,
}: {
  progress: { current: number; total: number; label: string } | null;
}) {
  const pct = progress && progress.total > 0 ? (progress.current / progress.total) * 100 : null;
  return (
    <div className="border-b px-4 py-3">
      <div className="text-muted-foreground mb-1.5 flex items-center justify-between text-xs">
        <span>{progress?.label ?? "Starting…"}</span>
        {progress && progress.total > 0 && (
          <span className="tabular-nums">
            {progress.current} / {progress.total}
          </span>
        )}
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div
          className={`bg-primary h-full rounded-full transition-all ${pct == null ? "w-1/3 animate-pulse" : ""}`}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
