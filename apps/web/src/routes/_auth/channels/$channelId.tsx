import { Button } from "@airwave/ui/components/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Copy, Loader2, Tv } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccentIconTile } from "@airwave/ui/components/accent-icon-tile";

import { useConfirm } from "@/components/confirm-dialog";
import { ProvenanceBadge } from "@/components/provenance-badge";
import { useBreadcrumb } from "@/context/breadcrumb-provider";
import { HeaderLeft, HeaderRight, TopHeaderRight } from "@/context/header-provider";
import { resolveTile } from "@/features/icons/app-icon";
import {
  CHANNEL_SECTIONS,
  ChannelForm,
  type BumperMode,
  type ChannelPreviewInput,
  type MediaType,
  type Ordering,
} from "@/features/channels/channel-form";
import { ChannelNowPlaying } from "@/features/channels/channel-now-playing";
import { ChannelPreviewPanel } from "@/features/channels/channel-preview-panel";
import { ChannelScheduleTimeline } from "@/features/channels/channel-schedule-timeline";
import type { FilterGroup } from "@/features/channels/filter-builder";
import { formatDuration } from "@/features/channels/guide-meta";
import type { ChannelStrategy } from "@/features/channels/strategy-editor";
import { SectionToc } from "@/components/toc/toc";
import { useDetailsPanel } from "@/context/details-panel-provider";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/channels/$channelId")({
  // `mainClassName: relative` makes the <main> card the containing block for the floating section TOC below,
  // so it positions in main's right gutter (above the scroll container) instead of the viewport.
  staticData: { breadcrumb: "Channel", mainClassName: "relative" },
  component: ChannelDetail,
});

const FORM_ID = "edit-channel-form";

function ChannelDetail() {
  const { channelId } = Route.useParams();
  const { confirm, dialog: confirmDialog } = useConfirm();
  // The section TOC is fixed-position, so a side panel (AI assistant) would slide over it — hide it then.
  const { isOpen: panelOpen } = useDetailsPanel();
  const navigate = useNavigate();
  const channel = useQuery(trpc.channels.get.queryOptions({ id: channelId }));
  useBreadcrumb(channel.data?.name);
  const nowNext = useQuery(trpc.channels.nowNext.queryOptions({ id: channelId }));
  const schedule = useQuery(trpc.channels.schedule.queryOptions({ id: channelId, hours: 48 }));
  // Auto-loads the resolved contents for an existing channel (refetched after a save).
  // `skipBatch` keeps this OUT of the page's query batch. It resolves the whole filter
  // against Plex and can take seconds on a big channel; batched, it held up `get` /
  // `nowNext` / `schedule` and blocked first paint — the tiles lazy-load their images, but
  // the batch meant the page still waited on the preview data itself.
  const preview = useQuery(
    trpc.channels.preview.queryOptions({ id: channelId }, { trpc: { context: { skipBatch: true } } }),
  );
  const [submitting, setSubmitting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [extending, setExtending] = useState(false);
  // Live filter/source/sort from the form — drives the unsaved-filter preview (#12).
  const [previewInput, setPreviewInput] = useState<ChannelPreviewInput | null>(null);

  const refreshSchedule = async () => {
    await Promise.all([nowNext.refetch(), schedule.refetch()]);
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await trpcClient.channels.generateSchedule.mutate({ id: channelId });
      await refreshSchedule();
      const span = formatDuration(r.coveredSeconds);
      const passNote = r.passes > 1 ? ` (${r.passes} passes)` : "";
      const breakNote = r.bumperCount > 0 ? ` + ${r.bumperCount} breaks` : "";
      toast.success(
        `Scheduled ${r.programCount} programs${breakNote} from ${r.poolSize} items · ${span}${passNote}.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  };

  const extend = async () => {
    setExtending(true);
    try {
      const r = await trpcClient.channels.extendSchedule.mutate({ id: channelId, force: true });
      await refreshSchedule();
      toast.success(r.extended ? `Added ${r.added} more slots.` : "Nothing to extend — generate first.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Extend failed");
    } finally {
      setExtending(false);
    }
  };

  const del = async () => {
    if (!(await confirm({ title: "Delete this channel?", confirmLabel: "Delete", destructive: true })))
      return;
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

  const tile = resolveTile({
    icon: channel.data.icon,
    tint: channel.data.tint,
    inheritedIcon: channel.data.packageIcon,
    inheritedTint: channel.data.packageTint,
    defaultIcon: Tv,
  });

  return (
    <div className="space-y-6 pb-32">
      {confirmDialog}
      {/* Floating section TOC, top-right of the pane — overlays (no layout impact), only when there's room
          (≥1800px) and no side panel is open (the AI assistant would otherwise slide over this fixed TOC).
          Nested: the channel (the form's Frame) is the H2, its sections are the H3s beneath it. */}
      {!panelOpen && (
      <aside className="absolute right-6 top-20 z-20 hidden w-44 min-[1800px]:block">
        <p className="text-muted-foreground mb-3 pl-5 text-xs font-medium">On this page</p>
        <SectionToc
          items={[
            { title: channel.data.name, url: "#ch-top", depth: 2 },
            ...CHANNEL_SECTIONS.map((s) => ({ title: s.label, url: `#${s.id}`, depth: 3 })),
            { title: "Preview", url: "#ch-preview", depth: 2 },
            { title: "Schedule", url: "#ch-schedule", depth: 2 },
          ]}
        />
      </aside>
      )}
      {/* Channel identity in the sub-header left: tinted icon tile · callsign · CH NN,
          each piece the same size, dot-separated. */}
      <HeaderLeft>
        <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <AccentIconTile icon={tile.Icon} tint={tile.tint} size="md" />
          <span aria-hidden>·</span>
          {channel.data.callsign && (
            <>
              <span className="tabular-nums">{channel.data.callsign}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="tabular-nums">CH {String(channel.data.number).padStart(2, "0")}</span>
          {(channel.data.generated || channel.data.aiGenerated) && (
            <>
              <span aria-hidden>·</span>
              <ProvenanceBadge generated={channel.data.generated} aiGenerated={channel.data.aiGenerated} />
            </>
          )}
        </div>
      </HeaderLeft>

      {/* Watch + Refresh preview live in the TOP header (left of the AI Assistant button via
          order-first). Delete + Save stay in the sub-header — Save is a normal outline button
          like Watch/Refresh (no primary emphasis), Delete a plain ghost (red was heavier than
          warranted; it confirms first). */}
      <TopHeaderRight>
        <Button variant="outline" size="sm" className="order-first" render={<Link to="/watch/$channelId" params={{ channelId }} />}>
          Watch
        </Button>
      </TopHeaderRight>

      <HeaderRight>
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/channels/new" search={{ from: channelId }} />}
        >
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Clone
        </Button>
        <Button variant="ghost" size="sm" onClick={del}>
          Delete
        </Button>
        <Button type="submit" form={FORM_ID} variant="outline" size="sm" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </HeaderRight>

      {/* No wrapping Card — the form's Frame is its own container and carries the title. */}
      <ChannelForm
        formId={FORM_ID}
        title="Edit channel"
        subtitle="What this channel plays, how it's ordered, and how it looks."
        initial={{
              name: channel.data.name,
              callsign: channel.data.callsign ?? "",
              number: String(channel.data.number),
              mediaTypes: channel.data.mediaTypes as MediaType[],
              filter: (channel.data.filter as FilterGroup | null) ?? undefined,
              sources: channel.data.sources ?? undefined,
              manualItemKeys: channel.data.manualItemKeys ?? undefined,
              ordering: channel.data.ordering as Ordering,
              strategy: (channel.data.strategy as ChannelStrategy | null) ?? null,
              keepMultiPartTogether: channel.data.keepMultiPartTogether,
              excludeSpecials: channel.data.excludeSpecials,
              sortField: channel.data.sortField,
              sortDir: channel.data.sortDir as "asc" | "desc",
              packageId: channel.data.packageId,
              icon: channel.data.icon,
              tint: channel.data.tint,
              description: channel.data.description,
              enabled: channel.data.enabled,
              bumperMode: channel.data.bumperMode as BumperMode,
            }}
            onPreviewInputChange={setPreviewInput}
            onSubmit={async (v) => {
              setSubmitting(true);
              try {
                await trpcClient.channels.update.mutate({
                  id: channelId,
                  name: v.name,
                  callsign: v.callsign || null,
                  number: Number(v.number),
                  mediaTypes: v.mediaTypes,
                  filter: v.filter,
                  sources: v.sources,
                  manualItemKeys: v.manualItemKeys,
                  ordering: v.ordering,
                  strategy: v.strategy,
                  keepMultiPartTogether: v.keepMultiPartTogether,
                  excludeSpecials: v.excludeSpecials,
                  sortField: v.sortField,
                  sortDir: v.sortDir,
                  packageId: v.packageId,
                  icon: v.icon,
                  tint: v.tint,
                  description: v.description,
                  enabled: v.enabled,
                  bumperMode: v.bumperMode,
                });
                toast.success("Saved.");
                await Promise.all([channel.refetch(), preview.refetch()]);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Save failed");
              } finally {
                setSubmitting(false);
              }
            }}
          />

      {/* Preview — the resolved OUTPUT of the filter, its own Frame. Shows the SAVED filter on load
          (preview.data), then live-resolves the UNSAVED filter as you edit (debounced) + on demand (#12). */}
      <div id="ch-preview" className="scroll-mt-24">
        <ChannelPreviewPanel
          input={previewInput}
          channelId={channelId}
          initialData={preview.data}
          initialLoading={preview.isLoading}
        />
      </div>

      <Frame id="ch-schedule" className="scroll-mt-24">
        <FrameHeader className="flex-row items-center justify-between">
          <div>
            <FrameTitle>Schedule</FrameTitle>
            <FrameDescription>The materialized timeline — what's on now and next.</FrameDescription>
          </div>
          <div className="flex gap-2">
            {nowNext.data?.endsAt && (
              <Button variant="ghost" size="sm" onClick={extend} disabled={extending}>
                {extending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Extend"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate schedule"}
            </Button>
          </div>
        </FrameHeader>
        <FramePanel className="space-y-4">
          <ChannelNowPlaying channelId={channelId} data={nowNext.data} />
          {schedule.data && schedule.data.length > 0 && (
            <ChannelScheduleTimeline items={schedule.data} />
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}
