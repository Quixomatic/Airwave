import { Button } from "@ChannelGuide/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@ChannelGuide/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HeaderRight } from "@/context/header-provider";
import { ChannelForm, type MediaType, type Ordering } from "@/features/channels/channel-form";
import type { FilterGroup } from "@/features/channels/filter-builder";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/channels/$channelId")({
  component: ChannelDetail,
});

const FORM_ID = "edit-channel-form";

function ChannelDetail() {
  const { channelId } = Route.useParams();
  const navigate = useNavigate();
  const channel = useQuery(trpc.channels.get.queryOptions({ id: channelId }));
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);

  const doPreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await trpcClient.channels.resolve.query({ id: channelId }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const del = async () => {
    if (!window.confirm("Delete this channel?")) return;
    try {
      await trpcClient.channels.remove.mutate({ id: channelId });
      toast.success("Channel deleted.");
      navigate({ to: "/channels" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  if (!channel.data) {
    return <div className="text-muted-foreground mx-auto max-w-2xl text-sm">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <HeaderRight>
        <Button variant="outline" size="sm" onClick={doPreview} disabled={previewing}>
          {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview"}
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={del}>
          Delete
        </Button>
        <Button type="submit" form={FORM_ID} size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </HeaderRight>

      <Link
        to="/channels"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="h-4 w-4" /> Channels
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Edit channel</CardTitle>
        </CardHeader>
        <CardContent>
          <ChannelForm
            formId={FORM_ID}
            initial={{
              name: channel.data.name,
              number: String(channel.data.number),
              mediaTypes: channel.data.mediaTypes as MediaType[],
              filter: (channel.data.filter as FilterGroup | null) ?? undefined,
              ordering: channel.data.ordering as Ordering,
            }}
            onSubmit={async (v) => {
              setSubmitting(true);
              try {
                await trpcClient.channels.update.mutate({
                  id: channelId,
                  name: v.name,
                  number: Number(v.number),
                  mediaTypes: v.mediaTypes,
                  filter: v.filter,
                  ordering: v.ordering,
                });
                toast.success("Saved.");
                await channel.refetch();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Save failed");
              } finally {
                setSubmitting(false);
              }
            }}
          />
          {preview && (
            <p className="text-muted-foreground mt-4 text-xs">
              <strong>{preview.count}</strong> items
              {preview.sample.length > 0 ? ` · ${preview.sample.join(", ")}…` : ""}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
