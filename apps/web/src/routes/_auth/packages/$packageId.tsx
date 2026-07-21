import { Button } from "@ChannelGuide/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { Textarea } from "@ChannelGuide/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useBreadcrumb } from "@/context/breadcrumb-provider";
import { HeaderRight } from "@/context/header-provider";
import { IconTintField } from "@/features/icons/icon-tint-field";
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
  const [icon, setIcon] = useState<string | null>(null);
  const [tint, setTint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (pkg.data) {
      setName(pkg.data.name);
      setDescription(pkg.data.description ?? "");
      setIcon(pkg.data.icon ?? null);
      setTint(pkg.data.tint ?? null);
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
        icon,
        tint,
      });
      toast.success("Saved.");
      await pkg.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const regenChannels = async () => {
    if (!pkg.data) return;
    if (!window.confirm(`Rebuild the channels in "${pkg.data.name}" from the preset? Existing generated channels here are replaced.`))
      return;
    setRegenerating(true);
    try {
      const r = await trpcClient.generator.regeneratePackage.mutate({ packageKey: pkg.data.key });
      toast.success(`Rebuilt — ${r.channelsCreated} channels.`);
      await pkg.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
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
    <div className="space-y-6">
      <HeaderRight>
        {pkg.data.generated && (
          <Button variant="outline" size="sm" onClick={regenChannels} disabled={regenerating}>
            {regenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Regenerate channels
          </Button>
        )}
        <Button variant="ghost" size="sm" className="text-destructive" onClick={del}>
          Delete
        </Button>
        <Button type="submit" form={FORM_ID} size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </HeaderRight>

      <Frame>
        <FrameHeader>
          <FrameTitle>Edit package</FrameTitle>
          <FrameDescription>Name, description, and how this package looks in the guide.</FrameDescription>
        </FrameHeader>
        <FramePanel>
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
            <div className="space-y-2">
              <Label>Appearance</Label>
              <IconTintField
                icon={icon}
                tint={tint}
                onIconChange={setIcon}
                onTintChange={setTint}
                defaultIcon={LayoutGrid}
              />
            </div>
          </form>
        </FramePanel>
      </Frame>

      <Frame>
        <FrameHeader>
          <FrameTitle>Channels ({pkg.data.channels.length})</FrameTitle>
          <FrameDescription>Channels filed into this package.</FrameDescription>
        </FrameHeader>
        <FramePanel className="p-0">
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
        </FramePanel>
      </Frame>
    </div>
  );
}
