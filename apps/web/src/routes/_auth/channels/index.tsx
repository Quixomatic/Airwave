import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent } from "@ChannelGuide/ui/components/card";
import { TintedIconTile } from "@ChannelGuide/ui/components/tinted-icon-tile";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, Tv } from "lucide-react";

import { resolveTile } from "@/features/icons/app-icon";
import { HeaderRight } from "@/context/header-provider";
import { trpc, trpcClient } from "@/utils/trpc";
import { toast } from "sonner";

export const Route = createFileRoute("/_auth/channels/")({
  component: ChannelsList,
});

function ChannelsList() {
  const channels = useQuery(trpc.channels.list.queryOptions());

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await trpcClient.channels.setEnabled.mutate({ id, enabled });
      await channels.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update channel");
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <HeaderRight>
        <Button size="sm" render={<Link to="/channels/new" />}>
          <Plus className="mr-2 h-4 w-4" />
          New channel
        </Button>
      </HeaderRight>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Live channels built from your enabled libraries.
        </p>
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
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
                  <TintedIconTile icon={tile.Icon} tint={tile.tint} size="lg" />
                  <span className="flex-1 truncate text-sm font-medium">{c.name}</span>
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
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) => toggle(c.id, e.target.checked)}
                  />
                </label>
              </li>
              );
            })}
            {channels.data?.length === 0 && (
              <li className="text-muted-foreground px-4 py-8 text-center text-sm">
                No channels yet.{" "}
                <Link to="/channels/new" className="text-primary hover:underline">
                  Add one
                </Link>
                .
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
