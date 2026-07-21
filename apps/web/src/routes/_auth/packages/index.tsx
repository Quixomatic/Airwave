import { AccentIconTile } from "@ChannelGuide/ui/components/accent-icon-tile";
import { Button } from "@ChannelGuide/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, LayoutGrid, Plus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { resolveTile } from "@/features/icons/app-icon";
import { HeaderRight, TopHeaderRight } from "@/context/header-provider";
import { trpc, trpcClient } from "@/utils/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_auth/packages/")({
  component: PackagesList,
});

function PackagesList() {
  const packages = useQuery(trpc.packages.list.queryOptions());
  const [refreshing, setRefreshing] = useState(false);
  const hasGenerated = packages.data?.some((p) => p.generated);

  const refreshStyling = async () => {
    setRefreshing(true);
    try {
      await trpcClient.generator.regeneratePackages.mutate();
      toast.success("Package styling refreshed from presets.");
      await packages.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-4">
      <HeaderRight>
        {hasGenerated && (
          <Button variant="outline" size="sm" onClick={refreshStyling} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Refresh styling
          </Button>
        )}
      </HeaderRight>

      {/* New package sits in the TOP header's right slot, left of the AI Assistant button.
          The slot is a flex row and the portal appends after the assistant, so `order-first`
          pulls this ahead of it. Outline style to match the page's other actions. */}
      <TopHeaderRight>
        <Button variant="outline" size="sm" className="order-first" render={<Link to="/packages/new" />}>
          <Plus className="mr-1 h-4 w-4" /> New package
        </Button>
      </TopHeaderRight>

      <Frame>
        <FrameHeader>
          <FrameTitle>Packages</FrameTitle>
          <FrameDescription>
            Packages group channels into a lineup (e.g. "Kids &amp; Family"). Assign a channel to a
            package from its edit page.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="p-0">
          {packages.data && packages.data.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="No packages yet"
              description="Packages group channels into a lineup (e.g. “Kids & Family”). Create one to organize your guide."
              action={
                <Button size="sm" render={<Link to="/packages/new" />}>
                  <Plus className="mr-1 h-4 w-4" /> New package
                </Button>
              }
            />
          ) : (
            <div className="divide-border divide-y">
              {packages.data?.map((p) => {
                const tile = resolveTile({
                  icon: p.icon,
                  tint: p.tint,
                  defaultIcon: LayoutGrid,
                  defaultTint: "violet",
                });
                return (
                  <Link
                    key={p.id}
                    to="/packages/$packageId"
                    params={{ packageId: p.id }}
                    className="hover:bg-accent/50 flex items-center gap-3 p-4 transition-colors"
                  >
                    <AccentIconTile icon={tile.Icon} tint={tile.tint} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {p.name}
                        {p.generated && (
                          <span className="border-border text-muted-foreground rounded border px-1 text-[10px] uppercase">
                            Auto
                          </span>
                        )}
                      </p>
                      {p.description && (
                        <p className="text-muted-foreground truncate text-xs">{p.description}</p>
                      )}
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {p.channelCount} channel{p.channelCount === 1 ? "" : "s"}
                    </span>
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  </Link>
                );
              })}
            </div>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}
