import { Badge } from "@ChannelGuide/ui/components/badge";
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
import { Plus, Server as ServerIcon } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
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

      <Frame>
        <FrameHeader>
          <FrameTitle>Sources</FrameTitle>
          <FrameDescription>
            Media servers ChannelGuide builds channels from and serves content to.
          </FrameDescription>
        </FrameHeader>
        <FramePanel className="p-0">
          {sources.data && sources.data.length === 0 ? (
            <EmptyState
              icon={ServerIcon}
              title="No media sources"
              description="Connect a Plex server to build channels from your library and stream to your clients."
              action={
                <Button size="sm" render={<Link to="/sources/new" />}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add source
                </Button>
              }
            />
          ) : (
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
                    {!s.connected ? (
                      <Badge variant="outline" className="border-red-500/30 text-red-600">
                        Disconnected
                      </Badge>
                    ) : !s.synced ? (
                      <Badge variant="outline" className="border-amber-500/30 text-amber-600">
                        Not synced
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">
                        Ready
                      </Badge>
                    )}
                    <span className="text-muted-foreground text-xs uppercase">{s.type}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}
