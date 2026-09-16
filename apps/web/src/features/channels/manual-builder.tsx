import { Button } from "@airwave/ui/components/button";
import { Checkbox } from "@airwave/ui/components/checkbox";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, Clapperboard, Filter, ListChecks, ListTree, Plus, Search, SearchX, Tv, X } from "lucide-react";
import { useEffect, useState } from "react";

import { BottomBlur } from "@/components/bottom-blur";
import { EmptyState } from "@/components/empty-state";
import { sourceImg } from "@/lib/img";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

import { GRID_CLASS, PreviewSkeleton } from "./channel-preview";

/**
 * The Manual-mode ("hand-picked") pool builder. A search bar (with Movies / TV Shows scope baked in) queries
 * the MediaItem cache; results render as poster tiles (matching the preview grid) with a check-circle each.
 * A show tile carries a caret: expanding it opens a full-width drill panel directly below with the show's
 * seasons, and each season can be drilled again to its episode tiles — check-circles all the way down.
 * "Add item(s)" commits the checked selection: a whole show stores the show key (resolves live to its
 * current episodes), a whole season stores that season's episode keys, and a movie / episode stores its own.
 */

const ONE_ROW = 8;
const se = (s?: number | null, e?: number | null) =>
  s != null && e != null ? `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}` : null;

/** The small round check-circle overlay used on every selectable thing. */
function CheckDot({ selected, floating }: { selected: boolean; floating?: boolean }) {
  return (
    <span
      className={cn(
        "flex size-5 items-center justify-center rounded-full border transition-colors",
        floating && "absolute right-1 top-1",
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : floating
            ? "border-white/70 bg-black/40 text-transparent group-hover:text-white/80"
            : "border-muted-foreground/40 text-transparent hover:text-muted-foreground/60",
      )}
    >
      <Check className="size-3.5" />
    </span>
  );
}

type Tile = { title: string; subtitle?: string; thumb?: string; isShow?: boolean };

/** A selectable poster tile (same shape as the preview tiles). Shows get an expand caret over the poster. */
function PickTile({
  sourceId,
  tile,
  selected,
  onToggle,
  expanded,
  onExpand,
}: {
  sourceId: string;
  tile: Tile;
  selected: boolean;
  onToggle: () => void;
  expanded?: boolean;
  onExpand?: () => void;
}) {
  const src = tile.thumb ? sourceImg(sourceId, tile.thumb, 240) : null;
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="group relative flex flex-col gap-1">
      <button type="button" onClick={onToggle} className="block text-left">
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
          <CheckDot selected={selected} floating />
        </div>
      </button>
      {/* Expand caret (shows only) — a sibling button so it isn't nested inside the toggle button. */}
      {onExpand && (
        <button
          type="button"
          onClick={onExpand}
          aria-label={expanded ? "Collapse" : "Expand seasons"}
          aria-expanded={expanded}
          className="absolute bottom-8 left-1 flex items-center gap-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] font-medium text-white"
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Seasons
        </button>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium" title={tile.title}>
          {tile.title}
        </p>
        {tile.subtitle && <p className="text-muted-foreground truncate text-[10px]">{tile.subtitle}</p>}
      </div>
    </div>
  );
}

/** The full-width drill panel under an expanded show: its seasons, each drillable to its episode tiles. */
function ShowDrill({
  sourceId,
  showKey,
  showTitle,
  checked,
  toggle,
}: {
  sourceId: string;
  showKey: string;
  showTitle: string;
  checked: Set<string>;
  toggle: (keys: string | string[]) => void;
}) {
  const [openSeasons, setOpenSeasons] = useState<Set<number>>(new Set());
  const seasons = useQuery(
    trpc.channels.showEpisodes.queryOptions({ mediaSourceId: sourceId, showRatingKey: showKey }, { enabled: !!sourceId }),
  );

  return (
    <div className="bg-muted/40 col-span-full space-y-2 rounded-md border p-3">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        <ListTree className="size-3.5" /> {showTitle} · seasons
      </p>
      {seasons.isLoading ? (
        <p className="text-muted-foreground text-xs">Loading episodes…</p>
      ) : !seasons.data?.length ? (
        <p className="text-muted-foreground text-xs">No episodes.</p>
      ) : (
        <div className="space-y-1.5">
          {seasons.data.map((s) => {
            const epKeys = s.episodes.map((e) => e.ratingKey);
            const allOn = epKeys.length > 0 && epKeys.every((k) => checked.has(k));
            const open = openSeasons.has(s.season);
            return (
              <div key={s.season} className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <button type="button" onClick={() => toggle(epKeys)} aria-label={`Select all of season ${s.season}`}>
                    <CheckDot selected={allOn} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSeasons((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.season)) next.delete(s.season);
                        else next.add(s.season);
                        return next;
                      })
                    }
                    className="flex items-center gap-1"
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    <span className="font-medium">Season {s.season}</span>
                    <span className="text-muted-foreground text-xs">
                      {s.episodes.length} ep{s.episodes.length === 1 ? "" : "s"}
                    </span>
                  </button>
                </div>
                {open && (
                  <div className={cn(GRID_CLASS, "pl-7")}>
                    {s.episodes.map((e) => (
                      <PickTile
                        key={e.ratingKey}
                        sourceId={sourceId}
                        tile={{ title: e.title, subtitle: se(s.season, e.episode) ?? `E${e.episode ?? "?"}`, thumb: e.thumb }}
                        selected={checked.has(e.ratingKey)}
                        onToggle={() => toggle(e.ratingKey)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
  const [episodes, setEpisodes] = useState(false); // off by default so search doesn't always match episode titles
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedShow, setExpandedShow] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Changing the search (query or scope) clears any pending selection, so the action bar never lingers on
  // items from a previous result set.
  useEffect(() => {
    setChecked(new Set());
    setExpandedShow(null);
  }, [debounced, movies, tv, episodes]);

  const types = [
    ...(movies ? (["movie"] as const) : []),
    ...(tv ? (["show"] as const) : []),
    ...(episodes ? (["episode"] as const) : []),
  ];
  const canSearch = !!mediaSourceId && debounced.length >= 2 && types.length > 0;
  const results = useQuery(
    trpc.channels.searchMedia.queryOptions(
      { mediaSourceId, query: debounced, types: [...types] },
      { enabled: canSearch, placeholderData: keepPreviousData },
    ),
  );
  const pool = useQuery(
    trpc.channels.itemsByKeys.queryOptions({ mediaSourceId, keys: value }, { enabled: !!mediaSourceId && value.length > 0 }),
  );

  const toggle = (keys: string | string[]) => {
    const arr = Array.isArray(keys) ? keys : [keys];
    setChecked((prev) => {
      const next = new Set(prev);
      const allIn = arr.every((k) => next.has(k));
      for (const k of arr) if (allIn) next.delete(k);
        else next.add(k);
      return next;
    });
  };
  const addChecked = () => {
    const toAdd = [...checked].filter((k) => !value.includes(k));
    if (toAdd.length) onChange([...value, ...toAdd]);
    setChecked(new Set());
  };
  const removeKey = (k: string) => onChange(value.filter((x) => x !== k));

  const data = results.data;
  const hasResults = data && (data.movies.length > 0 || data.shows.length > 0 || data.episodes.length > 0);
  const searching = canSearch && results.isFetching && !hasResults;
  // Only true when result tiles are actually on screen (not the idle/empty states, and not stale
  // keepPreviousData after the query was cleared) — gates the action bar + frosted edge.
  const showingResults = Boolean(hasResults) && debounced.length >= 2 && types.length > 0;

  // The top-level result items (movies + whole shows + direct episodes), for "Select all".
  const resultKeys = data ? [...data.movies, ...data.shows, ...data.episodes].map((i) => i.ratingKey) : [];
  const allSelected = resultKeys.length > 0 && resultKeys.every((k) => checked.has(k));
  const selectAll = () => setChecked((prev) => new Set([...prev, ...resultKeys]));
  const clearSelection = () => setChecked(new Set());

  return (
    <div className="space-y-3 rounded-md border p-3">
      {/* Search bar as an input group: a standard-styled text input on the left, then a lighter (frame-base
          bg) segment with the scope checkboxes, then a Clear all — divided by left borders. */}
      <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex h-11 items-stretch overflow-hidden rounded-lg border bg-transparent transition-colors focus-within:ring-3 dark:bg-input/30">
        <div className="flex flex-1 items-center gap-2 px-3">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies, shows, episodes…"
            className="placeholder:text-muted-foreground text-foreground h-full w-full bg-transparent text-base outline-none md:text-sm"
          />
        </div>
        <div className="border-input bg-muted/72 flex items-center gap-4 border-l px-3 text-sm">
          <label className="flex items-center gap-1.5">
            <Checkbox checked={movies} onCheckedChange={(v) => setMovies(v === true)} />
            Movies
          </label>
          <label className="flex items-center gap-1.5">
            <Checkbox checked={tv} onCheckedChange={(v) => setTv(v === true)} />
            TV Shows
          </label>
          <label className="flex items-center gap-1.5">
            <Checkbox checked={episodes} onCheckedChange={(v) => setEpisodes(v === true)} />
            Episodes
          </label>
        </div>
        <button
          type="button"
          onClick={() => setQuery("")}
          disabled={!query}
          className="border-input bg-muted/72 text-muted-foreground hover:text-foreground border-l px-3 text-sm font-medium transition-colors disabled:opacity-50"
        >
          Clear all
        </button>
      </div>

      {/* Results — poster tiles matching the preview grid. The scroll box uses p-1 so a selected tile's
          outer ring isn't clipped at the edges. The `relative` wrapper anchors the floating action bar. */}
      <div className="relative">
          {/* Bottom padding to clear the frosted edge / action bar — only while results (and thus the bar)
              are showing, so the empty/idle states aren't pushed up by dead space. */}
          <div className={cn("max-h-[32rem] space-y-3 overflow-y-auto p-1", showingResults && "pb-28")}>
          {types.length === 0 ? (
            <EmptyState
              icon={Filter}
              title="Select at least one search category"
              description="Turn on Movies, TV Shows, or Episodes to search."
            />
          ) : debounced.length < 2 ? (
            <EmptyState
              icon={Search}
              title="Search your library"
              description="Type at least two characters to find movies, shows, or episodes to add."
            />
          ) : searching ? (
            <PreviewSkeleton count={ONE_ROW} />
          ) : !hasResults ? (
            <EmptyState
              icon={SearchX}
              title="No results found"
              description="Try a different search, or adjust the Movies / TV Shows / Episodes scope."
            />
          ) : (
            <>
              {data.movies.length > 0 && (
                <TileSection label="Movies">
                  {data.movies.map((m) => (
                    <PickTile
                      key={m.ratingKey}
                      sourceId={mediaSourceId}
                      tile={{ title: m.title, subtitle: m.guide?.year ? String(m.guide.year) : undefined, thumb: m.guide?.thumb }}
                      selected={checked.has(m.ratingKey)}
                      onToggle={() => toggle(m.ratingKey)}
                    />
                  ))}
                </TileSection>
              )}
              {data.shows.length > 0 && (
                <TileSection label="Shows">
                  {data.shows.map((s) => (
                    <PickTileWithDrill
                      key={s.ratingKey}
                      sourceId={mediaSourceId}
                      showKey={s.ratingKey}
                      tile={{ title: s.title, thumb: s.guide?.thumb, isShow: true }}
                      selected={checked.has(s.ratingKey)}
                      onToggle={() => toggle(s.ratingKey)}
                      expanded={expandedShow === s.ratingKey}
                      onExpand={() => setExpandedShow((cur) => (cur === s.ratingKey ? null : s.ratingKey))}
                      checked={checked}
                      toggleKeys={toggle}
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

          {/* Frosted bottom edge — content fades into a blur as it scrolls under the action bar. */}
          <AnimatePresence>
            {showingResults && (
              <motion.div
                key="blur"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="pointer-events-none absolute inset-x-0 bottom-0 z-30 h-44"
              >
                <BottomBlur className="inset-0 h-full" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating action bar — appears as soon as there are results (even before anything is selected). */}
          <AnimatePresence>
            {showingResults && (
              <motion.div
                key="bar"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center"
              >
                <div className="bg-muted/72 pointer-events-auto flex items-center gap-1 rounded-md border py-1.5 pl-3 pr-1.5 shadow-lg backdrop-blur">
                  <span className="text-sm font-medium">{checked.size} selected</span>
                  <span className="bg-border mx-1 h-4 w-px" />
                  <Button type="button" variant="ghost" size="sm" onClick={selectAll} disabled={allSelected}>
                    Select all
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={clearSelection} disabled={checked.size === 0}>
                    Clear
                  </Button>
                  <Button type="button" size="sm" onClick={addChecked} disabled={checked.size === 0}>
                    <Plus className="mr-1 size-3.5" />
                    {checked.size > 0 ? `Add ${checked.size} item${checked.size === 1 ? "" : "s"}` : "Add items"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
      </div>

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
          // Small tile + details rows, flowing into as many columns as the width allows.
          <div className="grid max-h-[24rem] grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-4 gap-y-1.5 overflow-y-auto p-1">
            {(pool.data ?? []).map((it) => (
              <PoolRow
                key={it.ratingKey}
                sourceId={mediaSourceId}
                item={it}
                onRemove={() => removeKey(it.ratingKey)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A show tile that, when expanded, renders its drill panel as a full-width row right after it. */
function PickTileWithDrill({
  sourceId,
  showKey,
  tile,
  selected,
  onToggle,
  expanded,
  onExpand,
  checked,
  toggleKeys,
}: {
  sourceId: string;
  showKey: string;
  tile: Tile;
  selected: boolean;
  onToggle: () => void;
  expanded: boolean;
  onExpand: () => void;
  checked: Set<string>;
  toggleKeys: (keys: string | string[]) => void;
}) {
  return (
    <>
      <PickTile sourceId={sourceId} tile={tile} selected={selected} onToggle={onToggle} expanded={expanded} onExpand={onExpand} />
      {expanded && (
        <ShowDrill sourceId={sourceId} showKey={showKey} showTitle={tile.title} checked={checked} toggle={toggleKeys} />
      )}
    </>
  );
}

/** A pool entry: a small thumbnail with its details to the right + a remove button. Flows into columns. */
function PoolRow({
  sourceId,
  item,
  onRemove,
}: {
  sourceId: string;
  item: { ratingKey: string; title: string; type: string; showTitle?: string; season?: number; episode?: number; thumb?: string; available: boolean };
  onRemove: () => void;
}) {
  const isShow = item.type === "show";
  const kind = isShow ? "Whole show" : item.type === "episode" ? (se(item.season, item.episode) ?? "Episode") : "Movie";
  return (
    <div className="group flex items-center gap-2">
      <div className="bg-muted relative h-12 w-8 shrink-0 overflow-hidden rounded border">
        {item.thumb ? (
          <img src={sourceImg(sourceId, item.thumb, 120) ?? undefined} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="text-muted-foreground/40 flex h-full items-center justify-center">
            {isShow ? <Tv className="size-3.5" /> : <Clapperboard className="size-3.5" />}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={item.showTitle ? `${item.showTitle} — ${item.title}` : item.title}>
          {item.showTitle ? `${item.showTitle} — ` : ""}
          {item.title}
          {!item.available && <span className="text-muted-foreground"> (unavailable)</span>}
        </p>
        <p className="text-muted-foreground text-xs">{kind}</p>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${item.title}`}>
        <X className="size-4" />
      </Button>
    </div>
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
