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
  const nowNext = useQuery(trpc.channels.nowNext.queryOptions({ id: channelId }));
  const schedule = useQuery(trpc.channels.schedule.queryOptions({ id: channelId, hours: 12 }));
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);

  const refreshSchedule = async () => {
    await Promise.all([nowNext.refetch(), schedule.refetch()]);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await trpcClient.channels.generateSchedule.mutate({ id: channelId });
      await refreshSchedule();
      toast.success(
        `Scheduled ${r.itemCount} slots from ${r.poolSize} items · loops every ${formatDuration(r.loopSeconds)}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  };

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

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Schedule</CardTitle>
          <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate schedule"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {nowNext.data?.current ? (
            <div className="space-y-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  On now
                </span>
                <span className="text-muted-foreground text-xs">
                  +{formatDuration(nowNext.data.current.offsetSeconds)} in
                </span>
              </div>
              <p className="text-sm font-medium">{nowNext.data.current.title}</p>
              {nowNext.data.next && (
                <p className="text-muted-foreground text-xs">
                  Up next · {formatTime(nowNext.data.next.startsAt)} — {nowNext.data.next.title}
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No schedule yet. Generate one to see what would be on.
            </p>
          )}

          {schedule.data && schedule.data.length > 0 && (
            <ol className="divide-border divide-y border-t text-sm">
              {schedule.data.slice(0, 24).map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-muted-foreground w-14 shrink-0 tabular-nums text-xs">
                    {formatTime(s.startsAt)}
                  </span>
                  <span className="truncate">{s.title}</span>
                  <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                    {formatDuration(s.durationSeconds)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
