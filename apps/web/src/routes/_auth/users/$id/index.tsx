import { Button } from "@ChannelGuide/ui/components/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@ChannelGuide/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";

import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/users/$id/")({
  component: UserOverview,
});

function UserOverview() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const user = useQuery(trpc.users.get.queryOptions({ id }));
  const access = useQuery(trpc.users.getAccess.queryOptions({ id }));
  const u = user.data;
  const a = access.data;

  // Summarize what they can see.
  let summary = "—";
  if (u?.role === "admin") summary = "Full access (admin)";
  else if (a) {
    if (a.allAccess) summary = "All packages & channels (incl. new ones)";
    else {
      const full = a.packages.filter((p) => p.mode === "FULL").length;
      const partial = a.packages.filter((p) => p.mode === "PARTIAL").length;
      const chans = a.channelIds.length;
      const bits: string[] = [];
      if (full) bits.push(`${full} full package${full === 1 ? "" : "s"}`);
      if (partial) bits.push(`${partial} partial`);
      if (chans) bits.push(`${chans} channel${chans === 1 ? "" : "s"}`);
      summary = bits.length ? `Restricted — ${bits.join(", ")}` : "No access";
    }
  }

  return (
    <Frame>
      <FrameHeader className="flex-row items-center justify-between">
        <FrameTitle>Overview</FrameTitle>
      </FrameHeader>
      <FramePanel className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" value={u?.name || "—"} />
          <Field label="Email" value={u?.email || "—"} />
          <Field label="Role" value={u?.role === "admin" ? "Admin" : "User"} />
          <Field label="Joined" value={u?.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"} />
        </dl>

        <div className="border-border flex items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Access</p>
            <p className="text-muted-foreground truncate text-sm">{summary}</p>
          </div>
          {u?.role !== "admin" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate({ to: "/users/$id/access", params: { id } })}
            >
              <KeyRound className="mr-2 size-4" /> Manage access
            </Button>
          )}
        </div>
      </FramePanel>
    </Frame>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  );
}
