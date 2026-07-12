import { Button } from "@ChannelGuide/ui/components/button";
import { Card } from "@ChannelGuide/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Plus } from "lucide-react";

import { HeaderRight } from "@/context/header-provider";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/packages/")({
  component: PackagesList,
});

function PackagesList() {
  const packages = useQuery(trpc.packages.list.queryOptions());

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <HeaderRight>
        <Button size="sm" render={<Link to="/packages/new" />}>
          <Plus className="mr-1 h-4 w-4" /> New package
        </Button>
      </HeaderRight>

      <p className="text-muted-foreground text-sm">
        Packages group channels into a lineup (e.g. "Kids & Family"). Assign a channel to a package
        from its edit page.
      </p>

      {packages.data && packages.data.length > 0 ? (
        <Card className="divide-border divide-y p-0">
          {packages.data.map((p) => (
            <Link
              key={p.id}
              to="/packages/$packageId"
              params={{ packageId: p.id }}
              className="hover:bg-accent/50 flex items-center gap-3 p-4 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{p.name}</p>
                {p.description && (
                  <p className="text-muted-foreground truncate text-xs">{p.description}</p>
                )}
              </div>
              <span className="text-muted-foreground text-xs">
                {p.channelCount} channel{p.channelCount === 1 ? "" : "s"}
              </span>
              <ChevronRight className="text-muted-foreground h-4 w-4" />
            </Link>
          ))}
        </Card>
      ) : (
        <Card className="text-muted-foreground p-8 text-center text-sm">
          No packages yet. Create one to group your channels.
        </Card>
      )}
    </div>
  );
}
