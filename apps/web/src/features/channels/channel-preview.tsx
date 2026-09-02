import { Skeleton } from "@airwave/ui/components/skeleton";
import { Clapperboard, FilterX, Tv } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { channelImg, sourceImg } from "@/lib/img";
import { cn } from "@/lib/utils";

/**
 * Artwork tiles for a channel's resolved pool. Shows a poster grid — a SHOW's episodes are coalesced into
 * one tile with an episode-count badge + season line; movies show their year. Backed by
 * `channels.preview` (full PlexItems) and the public `/img/:channelId` artwork proxy.
 */

type PreviewItem = {
  ratingKey: string;
  title: string;
  year?: number;
  episodes?: number;
  seasons?: number;
  guide?: { thumb?: string; year?: number; contentRating?: string };
};
export type ChannelPreviewData = { totalItems: number; showCount: number; movieCount: number; items: PreviewItem[] };

// The responsive tile grid, shared by the real tiles and the skeletons so they align exactly.
const GRID_CLASS = "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8";
const ONE_ROW = 8; // lg:grid-cols-8 → a single desktop row of skeletons for the first-ever load.

export function ChannelPreviewTiles({
  channelId,
  sourceId,
  data,
  loading,
}: {
  /** Artwork proxy key: a SAVED channel (edit page). */
  channelId?: string;
  /** Fallback artwork key when there's no channel yet (create page) — proxies by media source. */
  sourceId?: string;
  data?: ChannelPreviewData;
  loading?: boolean;
}) {
  // While (re)resolving, show layout-matched skeletons, not a bare spinner. When there are results on screen
  // already (a reload), render the SAME number of tile skeletons so the area doesn't jump; on the first load
  // (no results yet) a single desktop row is enough.
  if (loading) {
    const count = data && data.items.length > 0 ? data.items.length : ONE_ROW;
    return <PreviewSkeleton count={count} />;
  }
  if (!data) return null;
  if (data.totalItems === 0) {
    return (
      <EmptyState
        icon={FilterX}
        title="No matches"
        description="Nothing in your library matches these conditions. Try loosening the filter."
      />
    );
  }

  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  return (
    <div className="space-y-2.5">
      <p className="text-muted-foreground text-xs">
        <strong className="text-foreground">{data.totalItems.toLocaleString()}</strong> items
        {data.showCount > 0 && ` · ${plural(data.showCount, "show")}`}
        {data.movieCount > 0 && ` · ${plural(data.movieCount, "movie")}`}
      </p>
      {/* Capped to ~2 rows of posters (tuned for the wide lg:8-col desktop layout); the rest scrolls. */}
      <div className={cn(GRID_CLASS, "max-h-[30rem] overflow-y-auto pr-1")}>
        {data.items.map((it) => (
          <PreviewTile key={it.ratingKey} channelId={channelId} sourceId={sourceId} item={it} />
        ))}
      </div>
    </div>
  );
}

/**
 * Loading placeholder that mirrors the real layout exactly — a metric-line bar up top, then `count` tile
 * skeletons (poster at the same 2/3 aspect, plus title + subtitle bars) on the same responsive grid. `count`
 * matches the on-screen results during a reload; it's ONE_ROW on the first-ever load.
 */
function PreviewSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-2.5">
      {/* stand-in for the "N items · X shows · Y movies" metric line */}
      <Skeleton className="h-3.5 w-44" />
      <div className={cn(GRID_CLASS, "max-h-[30rem] overflow-hidden pr-1")}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="aspect-[2/3] rounded-md border" />
            <div className="min-w-0 space-y-1">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewTile({ channelId, sourceId, item }: { channelId?: string; sourceId?: string; item: PreviewItem }) {
  // A saved channel proxies art by channelId; a pre-save preview (create page) proxies by media source.
  const src = channelId ? channelImg(channelId, item.guide?.thumb, 240) : sourceId ? sourceImg(sourceId, item.guide?.thumb, 240) : null;
  const isShow = item.episodes !== undefined;
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div className="bg-muted relative aspect-[2/3] overflow-hidden rounded-md border">
        {src ? (
          <>
            {/* Per-tile skeleton until the poster decodes — images lazy-load as you scroll. */}
            {!loaded && <div className="bg-muted absolute inset-0 animate-pulse" />}
            <img
              src={src}
              alt={item.title}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
              className={cn("h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
            />
          </>
        ) : (
          <div className="text-muted-foreground/40 flex h-full items-center justify-center">
            {isShow ? <Tv className="size-6" /> : <Clapperboard className="size-6" />}
          </div>
        )}
        {isShow && (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-medium tabular-nums text-white">
            {plural(item.episodes ?? 0, "ep")}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium" title={item.title}>
          {item.title}
        </p>
        <p className="text-muted-foreground truncate text-[10px]">
          {isShow ? plural(item.seasons ?? 0, "season") : (item.guide?.year ?? item.year ?? "")}
        </p>
      </div>
    </div>
  );
}

function plural(n: number, s: string) {
  return `${n} ${s}${n === 1 ? "" : "s"}`;
}
