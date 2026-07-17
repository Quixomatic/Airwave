import { Card } from "@ChannelGuide/ui/components/card";
import { AccentIconTile } from "@ChannelGuide/ui/components/accent-icon-tile";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Tv, Tv2 } from "lucide-react";

import { resolveTile } from "@/features/icons/app-icon";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/guide")({
  staticData: { breadcrumb: "Guide", breadcrumbIcon: Tv2, breadcrumbTint: "cyan" },
  component: Guide,
});

function Guide() {
  const navigate = useNavigate();
  const guide = useQuery({
    ...trpc.channels.guide.queryOptions({ forwardMinutes: 150 }),
    refetchInterval: 60_000,
  });
  const sessions = useQuery({
    ...trpc.playback.sessions.queryOptions(),
    refetchInterval: 5_000,
  });

  const tune = (channelId: string) =>
    navigate({ to: "/watch/$channelId", params: { channelId } });

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Guide</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          What's on across every channel. Click a program to tune in.
        </p>
      </div>

      <NowWatching sessions={sessions.data ?? []} />

      {guide.data && (
        <Card className="overflow-hidden p-0">
          <TimeHeader minutes={guide.data.windowMinutes} serverTime={guide.data.serverTime} />
          <div className="max-h-[65vh] divide-y overflow-y-auto">
            {guide.data.channels.map((ch) => {
              const tile = resolveTile({
                icon: ch.icon,
                tint: ch.tint,
                inheritedIcon: ch.package?.icon,
                inheritedTint: ch.package?.tint,
                defaultIcon: Tv,
              });
              return (
                <div key={ch.id} className="flex">
                  <button
                    onClick={() => tune(ch.id)}
                    className="hover:bg-muted/50 flex w-44 shrink-0 items-center gap-2 border-r p-2 text-left"
                  >
                    <span className="text-muted-foreground w-6 shrink-0 text-xs tabular-nums">
                      {ch.number}
                    </span>
                    <AccentIconTile icon={tile.Icon} tint={tile.tint} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{ch.name}</span>
                      {ch.callsign && (
                        <span className="text-muted-foreground block truncate font-mono text-[10px]">
                          {ch.callsign}
                        </span>
                      )}
                    </span>
                  </button>

                  <div className="bg-muted/20 relative h-14 flex-1">
                    {/* now line */}
                    <div className="bg-primary/70 absolute inset-y-0 left-0 z-10 w-0.5" />
                    {ch.programs.map((p) => {
                      const pos = blockPos(p.startsAt, p.durationSeconds, guide.data.serverTime, guide.data.windowMinutes);
                      if (pos.width <= 0) return null;
                      return (
                        <button
                          key={p.id}
                          onClick={() => tune(ch.id)}
                          style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                          className="hover:bg-accent bg-card absolute inset-y-1 overflow-hidden rounded border px-2 text-left"
                          title={guideTitle(p.guide)}
                        >
                          <span className="block truncate text-xs font-medium leading-tight">
                            {guideTitle(p.guide)}
                          </span>
                          <span className="text-muted-foreground block truncate text-[10px]">
                            {formatTime(p.startsAt)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {guide.data.channels.length === 0 && (
              <p className="text-muted-foreground p-6 text-center text-sm">
                No enabled channels with schedules yet.
              </p>
            )}
          </div>
        </Card>
      )}
      {guide.isLoading && <p className="text-muted-foreground text-sm">Loading guide…</p>}
    </div>
  );
}

type Session = {
  id: string;
  user: string;
  channel: { number: number; name: string; callsign: string | null } | null;
  state: string;
  title: string | null;
  delaySeconds: number;
};

function NowWatching({ sessions }: { sessions: Session[] }) {
  return (
    <Card className="p-3">
      <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
        Now watching ({sessions.length})
      </p>
      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No one's watching right now.</p>
      ) : (
        <ul className="space-y-1.5">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{s.user}</span>
              {s.channel && (
                <span className="text-muted-foreground">
                  · Ch {s.channel.number} {s.channel.name}
                </span>
              )}
              <span className="text-muted-foreground truncate">
                ·{" "}
                {s.state === "bumper"
                  ? "On a break"
                  : s.title
                    ? `Watching ${s.title}`
                    : s.state}
              </span>
              <span className="ml-auto shrink-0">
                {s.delaySeconds < 5 ? (
                  <span className="rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                    Live
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {formatBehind(s.delaySeconds)} behind
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TimeHeader({ minutes, serverTime }: { minutes: number; serverTime: string | Date }) {
  const start = new Date(serverTime).getTime();
  const ticks: { pct: number; label: string }[] = [];
  for (let m = 0; m <= minutes; m += 30) {
    ticks.push({ pct: (m / minutes) * 100, label: formatTime(new Date(start + m * 60_000)) });
  }
  return (
    <div className="flex border-b text-xs">
      <div className="text-muted-foreground w-44 shrink-0 border-r p-2 font-medium">Channel</div>
      <div className="relative h-8 flex-1">
        {ticks.map((t, i) => (
          <span
            key={i}
            style={{ left: `${t.pct}%` }}
            className="text-muted-foreground absolute top-2 -translate-x-1/2 whitespace-nowrap"
          >
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function blockPos(
  startsAt: string | Date,
  durationSeconds: number,
  windowStart: string | Date,
  windowMinutes: number,
) {
  const winStart = new Date(windowStart).getTime() / 1000;
  const winSec = windowMinutes * 60;
  const startS = new Date(startsAt).getTime() / 1000;
  const left = Math.max(0, ((startS - winStart) / winSec) * 100);
  const right = Math.min(100, ((startS + durationSeconds - winStart) / winSec) * 100);
  return { left, width: right - left };
}

function guideTitle(g: { title: string; showTitle?: string }): string {
  return g.showTitle ? `${g.showTitle} — ${g.title}` : g.title;
}

function formatTime(d: string | Date): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatBehind(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m`;
}
