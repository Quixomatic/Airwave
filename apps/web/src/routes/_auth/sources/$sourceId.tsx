import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
  const [name, setName] = useState("");
  const [rescanning, setRescanning] = useState(false);

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
    if (!window.confirm("Remove this source? Channels using it will be affected.")) return;
    try {
      await trpcClient.sources.remove.mutate({ id: sourceId });
      toast.success("Source removed.");
      navigate({ to: "/sources" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    }
  };

  if (!source.data) {
    return <div className="text-muted-foreground mx-auto max-w-3xl text-sm">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <Link
        to="/sources"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Sources
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Libraries</CardTitle>
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
        </CardHeader>
        {syncing && <SyncProgress progress={syncJob?.progress ?? null} />}
        <CardContent className="p-0">
          <ul className="divide-y">
            {source.data.libraries.map((lib) => (
              <li key={lib.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{lib.title}</p>
                  <p className="text-muted-foreground text-xs capitalize">{lib.type}</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={lib.enabled}
                    onChange={(e) => toggleLibrary(lib.id, e.target.checked)}
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
        </CardContent>
      </Card>

      <Button variant="ghost" className="text-destructive" onClick={remove}>
        Remove source
      </Button>
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
