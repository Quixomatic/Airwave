import { channelImg } from "@/lib/img";

import {
  GuideMetaLine,
  formatClock,
  formatDuration,
  formatTime,
  formatWhen,
  guideTitle,
  runwaySeconds,
  type GuideMeta,
} from "./guide-meta";

type NowSlot = { guide: GuideMeta; startsAt: Date | string; durationSeconds: number };

export type NowNextData =
  | {
      current: (NowSlot & { offsetSeconds: number }) | null;
      next: NowSlot | null;
      endsAt: Date | string | null;
    }
  | undefined;

/**
 * The channel editor's "on now" panel — laid out like an active session in Settings → Sessions: a
 * portrait poster in a left gutter, the title + meta beside it, and a progress band (thin bar +
 * position / duration + a Live marker). Falls back to a prompt when nothing is scheduled.
 */
export function ChannelNowPlaying({
  channelId,
  data,
}: {
  channelId: string;
  data: NowNextData;
}) {
  if (!data?.current) {
    return (
      <p className="text-muted-foreground text-sm">
        No schedule yet. Generate one to see what would be on.
      </p>
    );
  }

  const cur = data.current;
  // The SHOW's portrait poster for episodes (showThumb), the movie's poster otherwise (thumb).
  const art = channelImg(channelId, cur.guide.showThumb ?? cur.guide.thumb, 240);
  const pct =
    cur.durationSeconds > 0 ? Math.min(100, (cur.offsetSeconds / cur.durationSeconds) * 100) : 0;

  return (
    <div className="space-y-3">
      {/* Media header — portrait poster | title + meta, laid out like a Settings → Sessions tile. */}
      <div className="flex gap-3">
        {art && (
          <img
            src={art}
            alt=""
            className="aspect-[2/3] w-24 shrink-0 self-start rounded-md border object-cover"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            On now
          </span>
          <p className="text-sm font-semibold">{guideTitle(cur.guide)}</p>
          <GuideMetaLine guide={cur.guide} />
          {cur.guide.summary && (
            <p className="text-muted-foreground line-clamp-3 text-xs">{cur.guide.summary}</p>
          )}
        </div>
      </div>

      {/* Program progress — the same thin bar + position/duration band as an active session. */}
      <div>
        <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
          <div className="bg-primary h-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-muted-foreground mt-1 flex items-center justify-between text-[11px] tabular-nums">
          <span>
            {formatClock(cur.offsetSeconds)} / {formatClock(cur.durationSeconds)}
          </span>
          <span className="font-semibold uppercase text-red-500">● Live</span>
        </div>
      </div>

      {(data.next || data.endsAt) && (
        // Footer band, like the Settings → Sessions card: a recessed strip in the Frame's own bg
        // (bg-muted/72), bled to the frame body's edges (-mx-5 against the FramePanel's p-5) with a
        // full-width border above and below. The bottom border is the divider to the schedule below,
        // so this component owns it and the timeline draws no border of its own.
        <div className="bg-muted/72 -mx-5 space-y-1 border-y px-5 py-3">
          {data.next && (
            <p className="text-muted-foreground text-xs">
              Up next · {formatTime(data.next.startsAt)} — {guideTitle(data.next.guide)}
            </p>
          )}
          {data.endsAt && (
            <p className="text-muted-foreground text-xs">
              Lineup runs until {formatWhen(data.endsAt)} ·{" "}
              {formatDuration(runwaySeconds(data.endsAt))} ahead
            </p>
          )}
        </div>
      )}
    </div>
  );
}
