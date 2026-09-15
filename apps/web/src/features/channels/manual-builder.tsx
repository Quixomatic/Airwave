import { Button } from "@airwave/ui/components/button";
import { Checkbox } from "@airwave/ui/components/checkbox";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, Clapperboard, ListChecks, Search, Tv, X } from "lucide-react";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { sourceImg } from "@/lib/img";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

import { GRID_CLASS, PreviewSkeleton } from "./channel-preview";

/**
 * The Manual-mode ("hand-picked") pool builder. A search bar (with Movies / TV Shows scope baked in) queries
 * the MediaItem cache; results render as poster tiles (matching the preview grid) with a check-circle each.
 * "Add item(s)" commits the checked selection into the pool: a whole show stores the show key (resolves live
 * to its current episodes), a movie / episode stores its own key. The current pool renders below as removable
 * rows. NOTE: drilling INTO a show (season / specific-episode picking from a tile) is a separate UX still to
 * be designed — for now a show tile selects the whole show, and specific episodes come from episode-title
 * search results.
 */

const ONE_ROW = 8;

const se = (s?: number | null, e?: number | null) =>
  s != null && e != null ? `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}` : null;

type Tile = {
  ratingKey: string;
  title: string;
  subtitle?: string;
  thumb?: string;
  isShow?: boolean;
};

/** A selectable poster tile (same shape as the preview tiles) with a check-circle + selected ring. */
function PickTile({ sourceId, tile, selected, onToggle }: { sourceId: string; tile: Tile; selected: boolean; onToggle: () => void }) {
  const src = tile.thumb ? sourceImg(sourceId, tile.thumb, 240) : null;
  const [loaded, setLoaded] = useState(false);
  return (
    <button type="button" onClick={onToggle} className="group flex flex-col gap-1 text-left">
      <div className={cn("bg-muted relative aspect-[2/3] overflow-hidden rounded-md border", selected && "ring-primary ring-2")}>
        {src ? (
          <>
            {!loaded && <div className="bg-muted absolute inset-0 animate-pulse" />}
            <img
              src={src}
              alt={tile.title}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(true)}
              className={cn("h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
            />
          </>
        ) : (
          <div className="text-muted-foreground/40 flex h-full items-center justify-center">
            {tile.isShow ? <Tv className="size-6" /> : <Clapperboard className="size-6" />}
          </div>
        )}
        {/* Check-circle: filled when selected, a faint hover affordance otherwise. */}
        <span
          className={cn(
            "absolute right-1 top-1 flex size-5 items-center justify-center rounded-full border transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-white/70 bg-black/40 text-transparent group-hover:text-white/80",
          )}
        >
          <Check className="size-3.5" />
        </span>
        {tile.isShow && (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-medium text-white">Show</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium" title={tile.title}>
          {tile.title}
        </p>
        {tile.subtitle && <p className="text-muted-foreground truncate text-[10px]">{tile.subtitle}</p>}
      </div>
    </button>
  );
}

function TileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <div className={GRID_CLASS}>{children}</div>
    </div>
  );
}

export function ManualBuilder({
  value,
  onChange,
  mediaSourceId,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  mediaSourceId: string;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [movies, setMovies] = useState(true);
  const [tv, setTv] = useState(true);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const types = [...(movies ? (["movie"] as const) : []), ...(tv ? (["show", "episode"] as const) : [])];
  const canSearch = !!mediaSourceId && debounced.length >= 2 && types.length > 0;
  const results = useQuery(
    trpc.channels.searchMedia.queryOptions(
      { mediaSourceId, query: debounced, types: [...types] },
      { enabled: canSearch, placeholderData: keepPreviousData },
    ),
  );
  // Label the current pool (a saved channel loads bare keys) so it renders with titles.
  const pool = useQuery(
    trpc.channels.itemsByKeys.queryOptions(
      { mediaSourceId, keys: value },
      { enabled: !!mediaSourceId && value.length > 0 },
    ),
  );

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const addChecked = () => {
    const toAdd = [...checked].filter((k) => !value.includes(k));
    if (toAdd.length) onChange([...value, ...toAdd]);
    setChecked(new Set());
  };
  const removeKey = (k: string) => onChange(value.filter((x) => x !== k));

  const data = results.data;
  const hasResults = data && (data.movies.length > 0 || data.shows.length > 0 || data.episodes.length > 0);
  const searching = canSearch && results.isFetching && !hasResults;

  return (
    <div className="space-y-3 rounded-md border p-3">
      {/* Search bar with the scope checkboxes baked in. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-3 py-2">
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, shows, episodes…"
            className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <Checkbox checked={movies} onCheckedChange={(v) => setMovies(v === true)} />
            Movies
          </label>
          <label className="flex items-center gap-1.5">
            <Checkbox checked={tv} onCheckedChange={(v) => setTv(v === true)} />
            TV Shows
          </label>
        </div>
      </div>

      {/* Results — poster tiles matching the preview grid. The scroll box uses p-1 so a selected tile's
          outer ring isn't clipped at the edges. */}
      {debounced.length >= 2 && (
        <div className="max-h-[32rem] space-y-3 overflow-y-auto p-1">
          {searching ? (
            <PreviewSkeleton count={ONE_ROW} />
          ) : !hasResults ? (
            <p className="text-muted-foreground py-4 text-center text-sm">No matches.</p>
          ) : (
            <>
              {data.movies.length > 0 && (
                <TileSection label="Movies">
                  {data.movies.map((m) => (
                    <PickTile
                      key={m.ratingKey}
                      sourceId={mediaSourceId}
                      tile={{ ratingKey: m.ratingKey, title: m.title, subtitle: m.guide?.year ? String(m.guide.year) : undefined, thumb: m.guide?.thumb }}
                      selected={checked.has(m.ratingKey)}
                      onToggle={() => toggle(m.ratingKey)}
                    />
                  ))}
                </TileSection>
              )}
              {data.shows.length > 0 && (
                <TileSection label="Shows">
                  {data.shows.map((s) => (
                    <PickTile
                      key={s.ratingKey}
                      sourceId={mediaSourceId}
                      tile={{ ratingKey: s.ratingKey, title: s.title, thumb: s.guide?.thumb, isShow: true }}
                      selected={checked.has(s.ratingKey)}
                      onToggle={() => toggle(s.ratingKey)}
                    />
                  ))}
                </TileSection>
              )}
              {data.episodes.length > 0 && (
                <TileSection label="Episodes">
                  {data.episodes.map((e) => (
                    <PickTile
                      key={e.ratingKey}
                      sourceId={mediaSourceId}
                      tile={{
                        ratingKey: e.ratingKey,
                        title: e.guide?.showTitle ? `${e.guide.showTitle} — ${e.title}` : e.title,
                        subtitle: se(e.guide?.season, e.guide?.episode) ?? undefined,
                        thumb: e.guide?.thumb,
                      }}
                      selected={checked.has(e.ratingKey)}
                      onToggle={() => toggle(e.ratingKey)}
                    />
                  ))}
                </TileSection>
              )}
            </>
          )}
        </div>
      )}

      {checked.size > 0 && (
        <Button type="button" size="sm" onClick={addChecked}>
          Add {checked.size} item{checked.size === 1 ? "" : "s"}
        </Button>
      )}

      {/* Current pool — removable. */}
      <div className="border-t pt-3">
        <p className="text-muted-foreground mb-2 text-xs font-medium">
          In this channel {value.length > 0 ? `(${value.length})` : ""}
        </p>
        {value.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Nothing added yet"
            description="Search above and add movies, shows, or episodes to build this channel."
          />
        ) : (
          <div className="space-y-1">
            {(pool.data ?? []).map((it) => (
              <div key={it.ratingKey} className="flex items-center gap-2">
                <div className="bg-muted relative h-12 w-8 shrink-0 overflow-hidden rounded border">
                  {it.thumb ? (
                    <img src={sourceImg(mediaSourceId, it.thumb, 120) ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-muted-foreground/40 flex h-full items-center justify-center">
                      {it.type === "show" ? <Tv className="size-3.5" /> : <Clapperboard className="size-3.5" />}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {it.showTitle ? `${it.showTitle} — ` : ""}
                    {it.title}
                    {!it.available && <span className="text-muted-foreground"> (unavailable)</span>}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {it.type === "show" ? "Whole show" : it.type === "episode" ? (se(it.season, it.episode) ?? "Episode") : "Movie"}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeKey(it.ratingKey)} aria-label="Remove">
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
