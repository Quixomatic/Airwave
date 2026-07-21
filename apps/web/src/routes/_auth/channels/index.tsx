import { AccentIconTile } from "@ChannelGuide/ui/components/accent-icon-tile";
import { Button } from "@ChannelGuide/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { Switch } from "@ChannelGuide/ui/components/switch";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Sparkles, Tv } from "lucide-react";
import { useEffect } from "react";

import { EmptyState } from "@/components/empty-state";
import { resolveTile } from "@/features/icons/app-icon";
import { HeaderRight, TopHeaderRight } from "@/context/header-provider";
import { trpc, trpcClient } from "@/utils/trpc";
import { toast } from "sonner";

export const Route = createFileRoute("/_auth/channels/")({
  component: ChannelsList,
});

function ChannelsList() {
  const channels = useQuery(trpc.channels.list.queryOptions());
  const jobs = useQuery({
    ...trpc.jobs.list.queryOptions(),
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.id === "lineup-generate" && j.running) ? 1500 : false,
  });
  const genJob = jobs.data?.find((j) => j.id === "lineup-generate");
  const generating = genJob?.running ?? false;

  // Refetch the channel list whenever a generation run completes.
  useEffect(() => {
    void channels.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genJob?.lastFinishedAt]);

  const autoGenerate = async () => {
    if (
      !window.confirm(
        "Auto-generate the lineup? This rebuilds all auto-generated packages/channels from your library — your manually-created channels are left untouched.",
      )
    )
      return;
    try {
      await trpcClient.jobs.run.mutate({ id: "lineup-generate" });
      toast.success("Generating lineup…");
      await jobs.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start generation");
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await trpcClient.channels.setEnabled.mutate({ id, enabled });
      await channels.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update channel");
    }
  };

  return (
    <div>
      <HeaderRight>
        <Button variant="outline" size="sm" onClick={autoGenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Auto-generate
        </Button>
      </HeaderRight>

      {/* New channel lives in the TOP header's right slot, to the left of the AI Assistant
          button. The slot is a flex row and the portal appends after the assistant, so
          `order-first` pulls this ahead of it visually. */}
      <TopHeaderRight>
        <Button variant="outline" size="sm" className="order-first" render={<Link to="/channels/new" />}>
          <Plus className="mr-2 h-4 w-4" />
          New channel
        </Button>
      </TopHeaderRight>

      <Frame>
        <FrameHeader>
          <FrameTitle>Channels</FrameTitle>
          <FrameDescription>Live channels built from your enabled libraries.</FrameDescription>
        </FrameHeader>

        {generating && (
          <div className="border-primary/30 bg-primary/5 rounded-md border px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="text-primary h-4 w-4 animate-spin" />
              <span>
                Generating lineup{genJob?.progress ? ` — ${genJob.progress.label}` : ""}
                {genJob?.progress && genJob.progress.total > 0
                  ? ` (${genJob.progress.current}/${genJob.progress.total})`
                  : ""}
              </span>
            </div>
          </div>
        )}

        <FramePanel className="p-0">
          {channels.data && channels.data.length === 0 ? (
            <EmptyState
              icon={Tv}
              title="No channels yet"
              description="Build a channel from your enabled libraries, or use Auto-generate for a full lineup."
              action={
                <Button size="sm" render={<Link to="/channels/new" />}>
                  <Plus className="mr-2 h-4 w-4" />
                  New channel
                </Button>
              }
            />
          ) : (
          <ul className="divide-y">
            {channels.data?.map((c) => {
              const tile = resolveTile({
                icon: c.icon,
                tint: c.tint,
                inheritedIcon: c.package?.icon,
                inheritedTint: c.package?.tint,
                defaultIcon: Tv,
              });
              return (
              <li key={c.id} className="flex items-center">
                <Link
                  to="/channels/$channelId"
                  params={{ channelId: c.id }}
                  className={`hover:bg-muted/50 flex flex-1 items-center gap-3 px-4 py-3 ${c.enabled ? "" : "opacity-50"}`}
                >
                  <span className="text-muted-foreground w-8 text-sm tabular-nums">{c.number}</span>
                  <AccentIconTile icon={tile.Icon} tint={tile.tint} size="lg" />
                  <span className="flex-1 truncate text-sm font-medium">
                    {c.name}
                    {c.callsign && (
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        {c.callsign}
                      </span>
                    )}
                  </span>
                  {!c.enabled && (
                    <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-xs">
                      Inactive
                    </span>
                  )}
                  {c.package && (
                    <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                      {c.package.name}
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs capitalize">
                    {c.ordering.toLowerCase().replace("_", " ")}
                  </span>
                </Link>
                <label
                  className="px-4"
                  title={c.enabled ? "Active — click to deactivate" : "Inactive — click to activate"}
                >
                  <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c.id, v === true)} />
                </label>
              </li>
              );
            })}
          </ul>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}
