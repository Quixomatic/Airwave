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
import { Loader2, Tv } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AccentIconTile } from "@airwave/ui/components/accent-icon-tile";

import { useBreadcrumb } from "@/context/breadcrumb-provider";
import { HeaderLeft, HeaderRight, TopHeaderRight } from "@/context/header-provider";
import { resolveTile } from "@/features/icons/app-icon";
import {
  ChannelForm,
  type BumperMode,
  type ChannelPreviewInput,
  type MediaType,
  type Ordering,
} from "@/features/channels/channel-form";
import { ChannelPreviewPanel } from "@/features/channels/channel-preview-panel";
import type { FilterGroup } from "@/features/channels/filter-builder";
import type { ChannelStrategy } from "@/features/channels/strategy-editor";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/channels/$channelId")({
  staticData: { breadcrumb: "Channel" },
  component: ChannelDetail,
});

const FORM_ID = "edit-channel-form";

function ChannelDetail() {
  const { channelId } = Route.useParams();
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

  const tile = resolveTile({
    icon: channel.data.icon,
    tint: channel.data.tint,
    inheritedIcon: channel.data.packageIcon,
    inheritedTint: channel.data.packageTint,
    defaultIcon: Tv,
  });

  return (
    <div className="space-y-6 pb-32">
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
              ordering: channel.data.ordering as Ordering,
              strategy: (channel.data.strategy as ChannelStrategy | null) ?? null,
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
                  ordering: v.ordering,
                  strategy: v.strategy,
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
      <ChannelPreviewPanel
        input={previewInput}
        channelId={channelId}
        initialData={preview.data}
        initialLoading={preview.isLoading}
      />


      <Frame>
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
          {nowNext.data?.current ? (
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  On now
                </span>
                <span className="text-muted-foreground text-xs">
                  +{formatDuration(nowNext.data.current.offsetSeconds)} in
                </span>
              </div>
              <p className="text-sm font-medium">{guideTitle(nowNext.data.current.guide)}</p>
              <GuideMetaLine guide={nowNext.data.current.guide} />
              {nowNext.data.current.guide.summary && (
                <p className="text-muted-foreground line-clamp-2 text-xs">
                  {nowNext.data.current.guide.summary}
                </p>
              )}
              {nowNext.data.next && (
                <p className="text-muted-foreground pt-1 text-xs">
                  Up next · {formatTime(nowNext.data.next.startsAt)} —{" "}
                  {guideTitle(nowNext.data.next.guide)}
                </p>
              )}
              {nowNext.data.endsAt && (
                <p className="text-muted-foreground text-xs">
                  Lineup runs until {formatWhen(nowNext.data.endsAt)} ·{" "}
                  {formatDuration(runwaySeconds(nowNext.data.endsAt))} ahead
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
              {schedule.data.slice(0, 40).map((s) =>
                s.kind === "BUMPER" ? (
                  <li
                    key={s.id}
                    className="text-muted-foreground flex items-center gap-3 py-1.5 text-xs italic"
                  >
                    <span className="w-24 shrink-0 not-italic tabular-nums">
                      {formatWhen(s.startsAt)}
                    </span>
                    <span className="truncate">▸ Break — Up Next: {guideTitle(s.guide)}</span>
                    <span className="ml-auto shrink-0 not-italic">
                      {formatDuration(s.durationSeconds)}
                    </span>
                  </li>
                ) : (
                  <li key={s.id} className="flex items-center gap-3 py-1.5">
                    <span className="text-muted-foreground w-24 shrink-0 tabular-nums text-xs">
                      {formatWhen(s.startsAt)}
                    </span>
                    <span className="truncate">
                      {guideTitle(s.guide)}
                      {s.guide.contentRating && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {s.guide.contentRating}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                      {formatDuration(s.durationSeconds)}
                    </span>
                  </li>
                ),
              )}
            </ol>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}

type GuideMeta = {
  title: string;
  showTitle?: string;
  season?: number;
  episode?: number;
  year?: number;
  contentRating?: string;
  genres?: string[];
  directors?: string[];
  audienceRating?: number;
  resolution?: string;
  audioChannels?: number;
  summary?: string;
};

function guideTitle(g: GuideMeta): string {
  return g.showTitle ? `${g.showTitle} — ${g.title}` : g.title;
}

function seasonEp(g: GuideMeta): string | null {
  if (g.season == null || g.episode == null) return null;
  return `S${String(g.season).padStart(2, "0")}E${String(g.episode).padStart(2, "0")}`;
}

function resLabel(r: string): string {
  if (r === "4k") return "4K";
  if (r === "sd") return "SD";
  return `${r}p`;
}

function audioLabel(ch?: number): string | null {
  if (!ch) return null;
  if (ch >= 8) return "7.1";
  if (ch >= 6) return "5.1";
  if (ch >= 2) return "2.0";
  return "1.0";
}

function GuideMetaLine({ guide }: { guide: GuideMeta }) {
  const parts: string[] = [];
  const se = seasonEp(guide);
  if (se) parts.push(se);
  if (guide.year) parts.push(String(guide.year));
  if (guide.contentRating) parts.push(guide.contentRating);
  if (guide.genres?.length) parts.push(guide.genres.slice(0, 3).join(", "));
  if (guide.directors?.length) parts.push(`Dir. ${guide.directors.join(", ")}`);
  if (guide.audienceRating) parts.push(`★ ${guide.audienceRating.toFixed(1)}`);

  const badges: string[] = [];
  if (guide.resolution) badges.push(resLabel(guide.resolution));
  const audio = audioLabel(guide.audioChannels);
  if (audio) badges.push(audio);

  if (parts.length === 0 && badges.length === 0) return null;
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
      {parts.length > 0 && <span>{parts.join(" · ")}</span>}
      {badges.map((b) => (
        <span key={b} className="border-border rounded border px-1 text-[10px] uppercase leading-4">
          {b}
        </span>
      ))}
    </p>
  );
}

function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatWhen(d: Date | string): string {
  return new Date(d).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function runwaySeconds(endsAt: Date | string): number {
  return Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
}

function formatDuration(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
