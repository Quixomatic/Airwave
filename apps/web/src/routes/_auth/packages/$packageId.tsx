import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { Textarea } from "@ChannelGuide/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useBreadcrumb } from "@/context/breadcrumb-provider";
import { HeaderRight } from "@/context/header-provider";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/packages/$packageId")({
  staticData: { breadcrumb: "Package" },
  component: PackageDetail,
});

const FORM_ID = "edit-package-form";

function PackageDetail() {
  const { packageId } = Route.useParams();
  const navigate = useNavigate();
  const pkg = useQuery(trpc.packages.get.queryOptions({ id: packageId }));
  useBreadcrumb(pkg.data?.name);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pkg.data) {
      setName(pkg.data.name);
      setDescription(pkg.data.description ?? "");
    }
  }, [pkg.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await trpcClient.packages.update.mutate({
        id: packageId,
        name,
        description: description.trim() || undefined,
      });
      toast.success("Saved.");
      await pkg.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const del = async () => {
    if (!window.confirm("Delete this package? Its channels stay but become unassigned.")) return;
    try {
      await trpcClient.packages.remove.mutate({ id: packageId });
      toast.success("Package deleted.");
      navigate({ to: "/packages" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (!pkg.data) {
    return <div className="text-muted-foreground mx-auto max-w-2xl text-sm">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <HeaderRight>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={del}>
          Delete
        </Button>
        <Button type="submit" form={FORM_ID} size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </HeaderRight>

      <Link
        to="/packages"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Packages
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit package</CardTitle>
        </CardHeader>
        <CardContent>
          <form id={FORM_ID} onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pname">Name</Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pdesc">Description</Label>
              <Textarea
                id="pdesc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Channels ({pkg.data.channels.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pkg.data.channels.length > 0 ? (
            <ul className="divide-border divide-y">
              {pkg.data.channels.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-muted-foreground w-10 shrink-0 tabular-nums text-sm">
                    {c.number}
                  </span>
                  <Link
                    to="/channels/$channelId"
                    params={{ channelId: c.id }}
                    className="hover:text-primary flex-1 truncate text-sm"
                  >
                    {c.name}
                  </Link>
                  {!c.enabled && <span className="text-muted-foreground text-xs">disabled</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground p-4 text-sm">
              No channels in this package yet. Assign one from its edit page (Package dropdown).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
