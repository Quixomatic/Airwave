import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent } from "@ChannelGuide/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/users")({
  component: UsersPage,
});

function UsersPage() {
  const users = useQuery(trpc.users.list.queryOptions());
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
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Admin-created and imported Plex users who can sign in.
          </p>
        </div>
        <Button onClick={importUsers} disabled={importing}>
          {importing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" />
          )}
          Import Plex Users
        </Button>
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          <ul className="divide-y">
            {users.data?.map((u) => (
              <li key={u.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name || u.email}</p>
                  <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                </div>
                <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-xs capitalize">
                  {u.role ?? "user"}
                </span>
              </li>
            ))}
            {users.data?.length === 0 && (
              <li className="text-muted-foreground px-4 py-6 text-center text-sm">
                No users yet.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
