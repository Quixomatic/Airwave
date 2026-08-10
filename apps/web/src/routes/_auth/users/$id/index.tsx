import { Badge } from "@airwave/ui/components/badge";
import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2, ShieldCheck, Trash2, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/modal";
import { trpc, trpcClient } from "@/utils/trpc";

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
  const admin = u?.role === "admin";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    setDeleting(true);
    try {
      await trpcClient.users.delete.mutate({ id });
      toast.success("User deleted.");
      navigate({ to: "/users" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setDeleting(false);
    }
  };
  const initials = (u?.name || u?.email || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

  // Summarize what they can see.
  let summary = "—";
  if (admin) summary = "Full access to everything";
  else if (a) {
    if (a.allAccess) summary = "All packages & channels (including ones added later)";
    else {
      const full = a.packages.filter((p) => p.mode === "FULL").length;
      const partial = a.packages.filter((p) => p.mode === "PARTIAL").length;
      const chans = a.channelIds.length;
      const bits: string[] = [];
      if (full) bits.push(`${full} full package${full === 1 ? "" : "s"}`);
      if (partial) bits.push(`${partial} partial`);
      if (chans) bits.push(`${chans} channel${chans === 1 ? "" : "s"}`);
      summary = bits.length ? `Restricted — ${bits.join(", ")}` : "No access to any channels";
    }
  }

  return (
    <div className="space-y-6">
      <Frame>
      <FramePanel className="space-y-6">
        {/* Hero — big avatar + name. */}
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          {u?.image ? (
            <img
              src={u.image}
              alt=""
              className="ring-border size-20 shrink-0 rounded-full object-cover ring-2"
            />
          ) : (
            <div className="ring-border flex size-20 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-2xl font-semibold text-emerald-600 ring-2">
              {initials}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-semibold">{u?.name || u?.email || "…"}</h2>
            {u?.name && u?.email && <p className="text-muted-foreground truncate">{u.email}</p>}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <Badge
                variant={admin ? "default" : "outline"}
                className={admin ? "gap-1 border-amber-500/30 bg-amber-500/15 text-amber-600" : "gap-1"}
              >
                {admin ? <ShieldCheck className="size-3" /> : <User className="size-3" />}
                {admin ? "Admin" : "User"}
              </Badge>
              {!admin && a && (
                <Badge
                  variant="outline"
                  className={a.allAccess ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600" : "text-muted-foreground"}
                >
                  {a.allAccess ? "All access" : "Restricted"}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Details. */}
        <dl className="border-border grid gap-4 border-t pt-5 sm:grid-cols-3">
          <Field label="Role" value={admin ? "Admin" : "User"} />
          <Field label="Joined" value={u?.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"} />
          <Field label="User ID" value={id} mono />
        </dl>

        {/* Access card. */}
        <div className="border-border bg-muted/40 flex items-center justify-between gap-3 rounded-xl border p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-background ring-border flex size-9 shrink-0 items-center justify-center rounded-lg ring-1">
              <KeyRound className="text-muted-foreground size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">Access</p>
              <p className="text-muted-foreground truncate text-sm">{summary}</p>
            </div>
          </div>
          {!admin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate({ to: "/users/$id/access", params: { id } })}
            >
              <KeyRound className="mr-2 size-4" /> Manage
            </Button>
          )}
        </div>
      </FramePanel>
      </Frame>

      {/* Danger zone — delete a user. Never an admin (the sole owner can't remove themselves). */}
      {!admin && (
        <Frame>
          <FrameHeader>
            <FrameTitle className="text-destructive">Danger zone</FrameTitle>
            <FrameDescription>Irreversible — there's no undo.</FrameDescription>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Delete this user</p>
              <p className="text-muted-foreground text-sm">
                Permanently removes their account, sign-in, and channel access. This{" "}
                <strong>cannot be undone</strong>.
              </p>
            </div>
            <Button variant="destructive" className="shrink-0" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 size-4" /> Delete user
            </Button>
          </FramePanel>
        </Frame>
      )}

      {deleteOpen && (
        <Modal open onClose={() => !deleting && setDeleteOpen(false)}>
          <h3 className="text-lg font-semibold">Delete user?</h3>
          <p className="text-muted-foreground mt-2 text-sm">
            This permanently removes <strong>{u?.name || u?.email}</strong> — their account, sign-in,
            and channel access. This can't be undone.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete user
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={`truncate text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
