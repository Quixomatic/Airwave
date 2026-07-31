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
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Loader2, ShieldCheck, User, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { trpc, trpcClient } from "@/utils/trpc";

/** Role pill — admin gets an amber shield, everyone else a muted user outline. */
function RoleBadge({ role }: { role?: string | null }) {
  const admin = role === "admin";
  return (
    <Badge
      variant={admin ? "default" : "outline"}
      className={admin ? "gap-1 border-amber-500/30 bg-amber-500/15 text-amber-600" : "gap-1"}
    >
      {admin ? <ShieldCheck className="size-3" /> : <User className="size-3" />}
      {admin ? "Admin" : "User"}
    </Badge>
  );
}

export const Route = createFileRoute("/_auth/users/")({
  component: UsersPage,
});

function UsersPage() {
  const users = useQuery(trpc.users.list.queryOptions());
  const list = users.data?.users;
  const totalChannels = users.data?.totalChannels ?? 0;
  const [importing, setImporting] = useState(false);

  const importUsers = async () => {
    setImporting(true);
    try {
      const r = await trpcClient.plex.importUsers.mutate();
      toast.success(
        `Imported ${r.imported} user${r.imported === 1 ? "" : "s"} — ${r.skipped} already existed.`,
      );
      await users.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <Frame>
        <FrameHeader className="flex-row items-center justify-between">
          <div>
            <FrameTitle>Users</FrameTitle>
            <FrameDescription>Admin-created and imported Plex users who can sign in.</FrameDescription>
          </div>
          <Button size="sm" onClick={importUsers} disabled={importing}>
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Import Plex Users
          </Button>
        </FrameHeader>
        <FramePanel className="p-0">
          {list && list.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No users yet"
              description="Import your Plex server's shared users, or they'll appear here once created."
              action={
                <Button size="sm" onClick={importUsers} disabled={importing}>
                  {importing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  Import Plex Users
                </Button>
              }
            />
          ) : (
            <ul className="divide-y">
              {list?.map((u) => (
                <li key={u.id}>
                  <Link
                    to="/users/$id"
                    params={{ id: u.id }}
                    className="hover:bg-muted/50 flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{u.name || u.email}</p>
                      <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {u.role !== "admin" && (
                        <Badge variant="outline" className="text-muted-foreground">
                          {u.allAccess
                            ? "All access"
                            : `${u.accessCount ?? 0} of ${totalChannels} channels`}
                        </Badge>
                      )}
                      <RoleBadge role={u.role} />
                      <ChevronRight className="text-muted-foreground size-4" />
                    </div>
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
