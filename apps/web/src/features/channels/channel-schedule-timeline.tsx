import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@airwave/ui/components/timeline";

import { formatDuration, formatWhen, guideTitle, rowBadges, type GuideMeta } from "./guide-meta";

type ScheduleItem = {
  id: string;
  kind: string;
  startsAt: Date | string;
  durationSeconds: number;
  guide: GuideMeta;
};

const MAX_ROWS = 40;

// Shared item margin — leaves room on the left for the timestamp gutter (sm+) and tightens the
// default per-row bottom padding so the list reads as a dense schedule, not an airy roadmap.
const ITEM =
  "sm:group-data-[orientation=vertical]/timeline:ms-36 group-data-[orientation=vertical]/timeline:not-last:pb-4";

// The timestamp gutter — pushed to the LEFT of the dot (the reui "timeline-2" layout), with room
// between it and the dot. On a narrow panel it falls back to a small label above the title.
const DATE_GUTTER =
  "sm:group-data-[orientation=vertical]/timeline:absolute sm:group-data-[orientation=vertical]/timeline:-left-36 sm:group-data-[orientation=vertical]/timeline:w-24 sm:group-data-[orientation=vertical]/timeline:text-right tabular-nums";

// A break has no dot (it's not a timeline stop), so its separator must span the full item height to
// keep the rail continuous through it — the default separator starts below where a dot would be.
const BREAK_RAIL =
  "top-0 group-data-[orientation=vertical]/timeline:h-full group-data-[orientation=vertical]/timeline:translate-y-0";

/**
 * The upcoming lineup as a vertical timeline, built on the shared `Timeline` primitive and laid out
 * like the reui "timeline-2" example: the timestamp sits in a left gutter, an outline dot + rail run
 * down the middle, and the program title + duration sit to the right (details below). Interstitial
 * breaks pass through the rail without a dot and read as minor interstitials between the programs.
 */
export function ChannelScheduleTimeline({ items }: { items: ScheduleItem[] }) {
  // The first real program is what's on now — set it as the timeline's active step.
  const activeIndex = items.findIndex((it) => it.kind !== "BUMPER");

  return (
    <Timeline defaultValue={activeIndex >= 0 ? activeIndex + 1 : 0} className="w-full">
      {items.slice(0, MAX_ROWS).map((s, i) =>
        s.kind === "BUMPER" ? (
          <TimelineItem key={s.id} step={i + 1} className={ITEM}>
            <TimelineHeader>
              <TimelineSeparator className={BREAK_RAIL} />
              {/* No TimelineIndicator — a break is not a timeline stop, so no dot. */}
              <TimelineTitle className="text-muted-foreground font-normal italic sm:-mt-0.5">
                Break · {s.durationSeconds}s
              </TimelineTitle>
            </TimelineHeader>
          </TimelineItem>
        ) : (
          <TimelineItem key={s.id} step={i + 1} className={ITEM}>
            <TimelineHeader>
              <TimelineSeparator />
              <TimelineDate className={DATE_GUTTER}>{formatWhen(s.startsAt)}</TimelineDate>
              <div className="flex items-center justify-between gap-3 sm:-mt-0.5">
                <TimelineTitle className="truncate font-normal">{guideTitle(s.guide)}</TimelineTitle>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatDuration(s.durationSeconds)}
                </span>
              </div>
              {/* Uniform visible outline; the primitive fills the active step (defaultValue) to
                  full `border-primary` via its own data-completed styling. */}
              <TimelineIndicator className="border-primary/40" />
            </TimelineHeader>
            {rowBadges(s.guide).length > 0 && (
              <TimelineContent className="mt-1 flex flex-wrap items-center gap-1.5">
                {rowBadges(s.guide).map((b) => (
                  <span
                    key={b}
                    className="border-border text-muted-foreground rounded border px-1 text-[10px] uppercase leading-4"
                  >
                    {b}
                  </span>
                ))}
              </TimelineContent>
            )}
          </TimelineItem>
        ),
      )}
    </Timeline>
  );
}
