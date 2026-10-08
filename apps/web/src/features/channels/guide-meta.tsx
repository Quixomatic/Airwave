/**
 * Shared presentation helpers for a channel's guide metadata (`GuideMeta`), used by the "on now"
 * panel and the schedule timeline on the channel editor. Kept separate so both components format
 * titles, badges, and times identically.
 */

export type GuideMeta = {
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
  thumb?: string;
  showThumb?: string;
};

export function guideTitle(g: GuideMeta): string {
  return g.showTitle ? `${g.showTitle} — ${g.title}` : g.title;
}

export function seasonEp(g: GuideMeta): string | null {
  if (g.season == null || g.episode == null) return null;
  return `S${String(g.season).padStart(2, "0")}E${String(g.episode).padStart(2, "0")}`;
}

export function resLabel(r: string): string {
  if (r === "4k") return "4K";
  if (r === "sd") return "SD";
  return `${r}p`;
}

export function audioLabel(ch?: number): string | null {
  if (!ch) return null;
  if (ch >= 8) return "7.1";
  if (ch >= 6) return "5.1";
  if (ch >= 2) return "2.0";
  return "1.0";
}

/** Compact badge labels for a schedule list row: season/episode, content rating, resolution, audio. */
export function rowBadges(g: GuideMeta): string[] {
  const out: string[] = [];
  const se = seasonEp(g);
  if (se) out.push(se);
  if (g.contentRating) out.push(g.contentRating);
  if (g.resolution) out.push(resLabel(g.resolution));
  const audio = audioLabel(g.audioChannels);
  if (audio) out.push(audio);
  return out;
}

export function GuideMetaLine({ guide }: { guide: GuideMeta }) {
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

export function formatTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatWhen(d: Date | string): string {
  return new Date(d).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function runwaySeconds(endsAt: Date | string): number {
  return Math.max(0, Math.floor((new Date(endsAt).getTime() - Date.now()) / 1000));
}

export function formatDuration(totalSeconds: number): string {
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** m:ss / h:mm:ss clock for the on-now progress band (matches Settings → Sessions). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}
