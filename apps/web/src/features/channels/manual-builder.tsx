import { Button } from "@airwave/ui/components/button";
import { Checkbox } from "@airwave/ui/components/checkbox";
import { Skeleton } from "@airwave/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronRight, Clapperboard, Filter, ListChecks, ListTree, Plus, Search, SearchX, Tv, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

// ── Smart-search facets ──────────────────────────────────────────────────────────────────────────
// A chip-based search: type a `prefix:` of a known facet (genre/actor/decade/…) and a dropdown of
// matching values opens below the SAME input; picking one commits a chip. Bare text = title filter.
type FacetKind =
  | "genre" | "actor" | "director" | "studio" | "rating" | "resolution" | "decade" | "year" | "audience" | "hdr" | "dovi";
type Chip = { kind: FacetKind; value: string };

const FACET_PREFIX: Record<string, FacetKind> = {
  genre: "genre", actor: "actor", director: "director", studio: "studio", rating: "rating",
  resolution: "resolution", decade: "decade", year: "year", audience: "audience", hdr: "hdr", dovi: "dovi",
};
/** Facets with a value-autocomplete dropdown (they hit channels.mediaFacetValues). */
const DROPDOWN_FACETS = new Set<FacetKind>(["genre", "actor", "director", "studio", "rating", "resolution", "decade"]);
const BOOL_FACETS = new Set<FacetKind>(["hdr", "dovi"]);
const NUMERIC_FACETS = new Set<FacetKind>(["year", "audience"]);
const FACET_LABEL: Record<FacetKind, string> = {
  genre: "Genre", actor: "Actor", director: "Director", studio: "Studio", rating: "Rating",
  resolution: "Resolution", decade: "Decade", year: "Year", audience: "Audience", hdr: "HDR", dovi: "Dolby Vision",
};
const PREFIX_HINT = Object.keys(FACET_PREFIX).map((p) => `${p}:`).join("  ");
/** The facet palette shown in the always-visible footer, in display order (prefix === the kind name). */
const FOOTER_FACETS: FacetKind[] = [
  "genre", "actor", "director", "studio", "rating", "resolution", "decade", "year", "audience", "hdr", "dovi",
];

/** Parse a leading `prefix:` of a known facet off the raw input. Returns the facet + the text after it. */
function parseFacetInput(q: string): { kind: FacetKind | null; value: string } {
  const m = /^([a-zA-Z]+):(.*)$/.exec(q);
  if (!m) return { kind: null, value: "" };
  const kind = FACET_PREFIX[m[1]!.toLowerCase()];
  return kind ? { kind, value: m[2]! } : { kind: null, value: "" };
}

/** Collapse committed chips into the searchMedia `facets` shape (OR within a facet, AND across). */
function chipsToFacets(chips: Chip[]) {
  const f: {
    genres?: string[]; actors?: string[]; directors?: string[]; studios?: string[];
    ratings?: string[]; resolutions?: string[]; decades?: number[]; years?: number[];
    audienceMin?: number; hdr?: boolean; dovi?: boolean;
  } = {};
  for (const c of chips) {
    if (c.kind === "genre") (f.genres ??= []).push(c.value);
    else if (c.kind === "actor") (f.actors ??= []).push(c.value);
    else if (c.kind === "director") (f.directors ??= []).push(c.value);
    else if (c.kind === "studio") (f.studios ??= []).push(c.value);
    else if (c.kind === "rating") (f.ratings ??= []).push(c.value);
    else if (c.kind === "resolution") (f.resolutions ??= []).push(c.value);
    else if (c.kind === "decade") (f.decades ??= []).push(Number(c.value));
    else if (c.kind === "year") (f.years ??= []).push(Number(c.value));
    else if (c.kind === "audience") f.audienceMin = Math.max(f.audienceMin ?? 0, Number(c.value));
    else if (c.kind === "hdr") f.hdr = true;
    else if (c.kind === "dovi") f.dovi = true;
  }
  return f;
}

/** The short label shown inside a committed chip. */
function chipLabel(c: Chip): string {
  if (BOOL_FACETS.has(c.kind)) return FACET_LABEL[c.kind];
  if (c.kind === "decade") return `${c.value}s`;
  if (c.kind === "audience") return `Audience ≥ ${c.value}`;
  return `${FACET_LABEL[c.kind]}: ${c.value}`;
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
  const [query, setQuery] = useState(""); // raw input: a facet-in-progress (`genre:…`) OR title text
  const [chips, setChips] = useState<Chip[]>([]);
  const [debouncedTitle, setDebouncedTitle] = useState("");
  const [facetQ, setFacetQ] = useState(""); // debounced value typed after a `prefix:`
  const [movies, setMovies] = useState(true);
  const [tv, setTv] = useState(true);
  const [episodes, setEpisodes] = useState(false); // off by default so search doesn't always match episode titles
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [expandedShow, setExpandedShow] = useState<string | null>(null);
  const [hi, setHi] = useState(0); // highlighted index in the facet dropdown

  // A leading `prefix:` of a known facet switches the input into facet mode; otherwise the bare text is
  // the title filter. The facet value is what the user types after the colon.
  const { kind: activeFacet, value: pendingValue } = parseFacetInput(query);
  const titleText = activeFacet ? "" : query.trim();
  const facetOpen = !!activeFacet && DROPDOWN_FACETS.has(activeFacet);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTitle(titleText), 300);
    return () => clearTimeout(t);
  }, [titleText]);
  useEffect(() => {
    const t = setTimeout(() => setFacetQ(pendingValue.trim()), 200);
    return () => clearTimeout(t);
  }, [pendingValue]);
  useEffect(() => setHi(0), [facetQ, activeFacet]);

  const types = [
    ...(movies ? (["movie"] as const) : []),
    ...(tv ? (["show"] as const) : []),
    ...(episodes ? (["episode"] as const) : []),
  ];
  const facets = chipsToFacets(chips);
  const hasChips = chips.length > 0;

  // Facet-value autocomplete (dropdown facets only). The `facet` arg falls back to "genre" while disabled
  // to keep the hook order stable; `enabled` gates the real fetch.
  const facetValuesQ = useQuery(
    trpc.channels.mediaFacetValues.queryOptions(
      {
        mediaSourceId,
        facet: (facetOpen ? activeFacet : "genre") as
          | "genre" | "actor" | "director" | "studio" | "rating" | "resolution" | "decade",
        query: facetQ,
      },
      { enabled: !!mediaSourceId && facetOpen, placeholderData: keepPreviousData },
    ),
  );
  const facetOptions = facetOpen ? (facetValuesQ.data ?? []) : [];

  const canSearch = !!mediaSourceId && types.length > 0 && (debouncedTitle.length >= 2 || hasChips);
  const results = useQuery(
    trpc.channels.searchMedia.queryOptions(
      { mediaSourceId, query: debouncedTitle, types: [...types], facets },
      { enabled: canSearch, placeholderData: keepPreviousData },
    ),
  );
  const pool = useQuery(
    trpc.channels.itemsByKeys.queryOptions({ mediaSourceId, keys: value }, { enabled: !!mediaSourceId && value.length > 0 }),
  );

  // Changing the result set clears any pending selection, so the action bar never lingers on stale items.
  const facetsKey = JSON.stringify(facets);
  useEffect(() => {
    setChecked(new Set());
    setExpandedShow(null);
  }, [debouncedTitle, facetsKey, movies, tv, episodes]);

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

  // ── Facet chips ──
  const commitChip = (kind: FacetKind, raw: string) => {
    const v = raw.trim();
    if (!BOOL_FACETS.has(kind) && !v) return;
    if (NUMERIC_FACETS.has(kind) && !Number.isFinite(Number(v))) return;
    const chip: Chip = { kind, value: BOOL_FACETS.has(kind) ? "" : v };
    setChips((prev) => (prev.some((c) => c.kind === chip.kind && c.value === chip.value) ? prev : [...prev, chip]));
    setQuery("");
  };
  const removeChip = (i: number) => setChips((prev) => prev.filter((_, j) => j !== i));

  // ── Facet palette footer ──
  const inputRef = useRef<HTMLInputElement>(null);
  // Picking a palette facet is the same as typing its prefix: a boolean flag commits straight away;
  // a value/numeric facet drops `prefix:` into the input (opening the value dropdown) and refocuses.
  const pickFacet = (kind: FacetKind) => {
    if (BOOL_FACETS.has(kind)) commitChip(kind, "");
    else setQuery(`${kind}:`);
    inputRef.current?.focus();
  };
  // Filter the palette by the current typed text (only when no prefix is active yet) — "gen" → Genre.
  const paletteQuery = query.includes(":") ? "" : query.trim().toLowerCase();
  const visibleFacets = paletteQuery
    ? FOOTER_FACETS.filter((k) => k.includes(paletteQuery) || FACET_LABEL[k].toLowerCase().includes(paletteQuery))
    : FOOTER_FACETS;

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && query === "" && chips.length) {
      e.preventDefault();
      setChips((prev) => prev.slice(0, -1));
      return;
    }
    if (!activeFacet) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
      return;
    }
    if (facetOpen && facetOptions.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHi((h) => Math.min(h + 1, facetOptions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHi((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commitChip(activeFacet, facetOptions[hi] ?? "");
        return;
      }
    }
    if (e.key === "Enter") {
      // numeric (year/audience) → the typed number; boolean (hdr/dovi) → the flag
      e.preventDefault();
      commitChip(activeFacet, BOOL_FACETS.has(activeFacet) ? "" : pendingValue);
    }
  };

  const data = results.data;
  const hasResults = data && (data.movies.length > 0 || data.shows.length > 0 || data.episodes.length > 0);
  const searching = canSearch && results.isFetching && !hasResults;
  // Only true when result tiles are actually on screen (gates the action bar + frosted edge).
  const showingResults = Boolean(hasResults) && canSearch;

  // The top-level result items (movies + whole shows + direct episodes), for "Select all".
  const resultKeys = data ? [...data.movies, ...data.shows, ...data.episodes].map((i) => i.ratingKey) : [];
  const allSelected = resultKeys.length > 0 && resultKeys.every((k) => checked.has(k));
  const selectAll = () => setChecked((prev) => new Set([...prev, ...resultKeys]));
  const clearSelection = () => setChecked(new Set());

  return (
    <div className="space-y-3 rounded-md border p-3">
      {/* Smart search bar: committed facet chips + the input (type `genre:`/`actor:`/`decade:`… for a
          facet, bare text = title), the Movies/TV/Episodes scope, and Clear. The `relative` wrapper
          anchors the facet-value dropdown directly below. */}
      <div className="relative">
        <div className="border-input focus-within:border-ring focus-within:ring-ring/50 flex min-h-11 items-stretch overflow-hidden rounded-t-lg border bg-transparent transition-colors focus-within:ring-3 dark:bg-input/30">
          <div className="flex flex-1 flex-wrap items-center gap-1.5 px-3 py-1.5">
            <Search className="text-muted-foreground size-4 shrink-0" />
            {chips.map((c, i) => (
              <span
                key={`${c.kind}:${c.value}:${i}`}
                className="bg-primary/10 text-primary flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
              >
                {chipLabel(c)}
                <button type="button" onClick={() => removeChip(i)} aria-label={`Remove ${chipLabel(c)}`} className="hover:text-primary/60">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={chips.length ? "Add more…" : "Search titles, or type genre:  actor:  decade: …"}
              className="placeholder:text-muted-foreground text-foreground min-w-[8rem] flex-1 bg-transparent text-base outline-none md:text-sm"
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
            onClick={() => {
              setQuery("");
              setChips([]);
            }}
            disabled={!query && chips.length === 0}
            className="border-input bg-muted/72 text-muted-foreground hover:text-foreground border-l px-3 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Clear all
          </button>
        </div>

        {/* Facet palette footer — a bordered strip flush below the bar (frame/muted bg), sharing the
            bar's left/right edge with a border on left/bottom/right (no top, it butts the bar). Click a
            facet to start it (same as typing its prefix); typing filters the palette ("gen" → Genre). */}
        <div className="border-input bg-muted/72 flex flex-wrap items-center gap-1.5 rounded-b-lg border border-t-0 px-3 py-2 text-xs">
          <span className="text-muted-foreground mr-0.5">Filter by</span>
          {visibleFacets.length === 0 ? (
            <span className="text-muted-foreground/70">no matching filter — keep typing to search titles</span>
          ) : (
            visibleFacets.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => pickFacet(k)}
                className="bg-background/60 text-foreground hover:bg-background rounded px-1.5 py-0.5 font-medium transition-colors"
              >
                {FACET_LABEL[k]}
              </button>
            ))
          )}
        </div>

        {/* Facet-value dropdown — opens while a `prefix:` is active. Input keeps focus (onMouseDown
            prevents the blur that would close it before the click lands). */}
        {activeFacet && (
          <div className="bg-popover absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border p-1 shadow-lg">
            {facetOpen ? (
              facetValuesQ.isFetching && facetOptions.length === 0 ? (
                <div className="space-y-1 p-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-full" />
                  ))}
                </div>
              ) : facetOptions.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title={`No ${FACET_LABEL[activeFacet].toLowerCase()} matches`}
                  description="Keep typing or try a different value."
                />
              ) : (
                facetOptions.map((v, i) => (
                  <button
                    key={v}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commitChip(activeFacet, v);
                    }}
                    onMouseEnter={() => setHi(i)}
                    className={cn(
                      "flex w-full items-center rounded px-2 py-1.5 text-left text-sm",
                      i === hi ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    {activeFacet === "decade" ? `${v}s` : v}
                  </button>
                ))
              )
            ) : (
              // Numeric (year/audience) or boolean (hdr/dovi): no value list — just the commit affordance.
              <div className="text-muted-foreground p-2 text-sm">
                {BOOL_FACETS.has(activeFacet) ? (
                  <>
                    Press Enter to add the <span className="text-foreground font-medium">{FACET_LABEL[activeFacet]}</span> filter.
                  </>
                ) : (
                  <>
                    Type a {FACET_LABEL[activeFacet].toLowerCase()} and press Enter — e.g.{" "}
                    <span className="text-foreground font-medium">{activeFacet === "year" ? "year:2015" : "audience:8"}</span>.
                  </>
                )}
              </div>
            )}
          </div>
        )}
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
          ) : debouncedTitle.length < 2 && !hasChips ? (
            <EmptyState
              icon={Search}
              title="Search your library"
              description="Type at least two characters, or add a filter like genre: / actor: / decade: to find things to add."
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
