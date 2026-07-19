import { Clapperboard, Loader2, Tv } from "lucide-react";
import { useState } from "react";

import { channelImg } from "@/lib/img";
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

export function ChannelPreviewTiles({ channelId, data, loading }: { channelId: string; data?: ChannelPreviewData; loading?: boolean }) {
  if (loading && !data) {
    return (
      <div className="text-muted-foreground mt-4 flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" /> Resolving channel contents…
      </div>
    );
  }
  if (!data) return null;
  if (data.totalItems === 0) {
    return <p className="text-muted-foreground mt-4 text-xs">No items match this channel's filter.</p>;
  }

  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  return (
    <div className="mt-4 space-y-2.5">
      <p className="text-muted-foreground text-xs">
        <strong className="text-foreground">{data.totalItems.toLocaleString()}</strong> items
        {data.showCount > 0 && ` · ${plural(data.showCount, "show")}`}
        {data.movieCount > 0 && ` · ${plural(data.movieCount, "movie")}`}
      </p>
      <div className="grid max-h-[34rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {data.items.map((it) => (
          <PreviewTile key={it.ratingKey} channelId={channelId} item={it} />
        ))}
      </div>
    </div>
  );
}

function PreviewTile({ channelId, item }: { channelId: string; item: PreviewItem }) {
  const src = channelImg(channelId, item.guide?.thumb, 240);
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
