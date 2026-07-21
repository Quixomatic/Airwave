import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent } from "@ChannelGuide/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Plus, Server as ServerIcon } from "lucide-react";

import { TopHeaderRight } from "@/context/header-provider";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/sources/")({
  component: SourcesList,
});

function SourcesList() {
  const sources = useQuery(trpc.sources.list.queryOptions());

  return (
    <div>
      {/* New source sits in the TOP header's right slot, left of the AI Assistant button.
          The slot is a flex row and the portal appends after the assistant, so `order-first`
          pulls this ahead of it. Outline style to match the other pages' header actions. */}
      <TopHeaderRight>
        <Button variant="outline" size="sm" className="order-first" render={<Link to="/sources/new" />}>
          <Plus className="mr-2 h-4 w-4" />
          New source
        </Button>
      </TopHeaderRight>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Media servers ChannelGuide builds channels from and serves content to.
        </p>
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          <ul className="divide-y">
            {sources.data?.map((s) => (
              <li key={s.id}>
                <Link
                  to="/sources/$sourceId"
                  params={{ sourceId: s.id }}
                  className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3"
                >
                  <ServerIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-muted-foreground truncate text-xs">{s.baseUrl}</p>
                  </div>
                  <span className="text-muted-foreground text-xs uppercase">{s.type}</span>
                </Link>
              </li>
            ))}
            {sources.data?.length === 0 && (
              <li className="text-muted-foreground px-4 py-8 text-center text-sm">
                No sources yet.{" "}
                <Link to="/sources/new" className="text-primary hover:underline">
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
