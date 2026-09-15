import { Button } from "@airwave/ui/components/button";
import { Checkbox } from "@airwave/ui/components/checkbox";
import { Input } from "@airwave/ui/components/input";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Clapperboard, Search, Tv, X } from "lucide-react";
import { useEffect, useState } from "react";

import { sourceImg } from "@/lib/img";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

/**
 * The Manual-mode ("hand-picked") pool builder. A search bar (with Movies / TV Shows scope baked in) queries
 * the MediaItem cache; results are movies, shows (expandable to seasons → episodes), and direct episode-title
 * hits, each with a check-circle. "Add item(s)" commits the checked selection into the pool: a whole show
 * stores the show key (resolves live to its current episodes), a season stores its episode keys, and an
 * episode/movie stores its own key. The current pool renders below as removable rows.
 */

const se = (s?: number | null, e?: number | null) =>
  s != null && e != null ? `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}` : null;

/** A round check toggle (Plex-style), filled emerald when selected. */
function CheckCircle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
        on
          ? "border-emerald-500 bg-emerald-500 text-white"
          : "border-muted-foreground/40 text-transparent hover:border-emerald-500",
      )}
    >
      <Check className="size-3.5" />
    </button>
  );
}

function Thumb({ sourceId, thumb, isShow }: { sourceId: string; thumb?: string; isShow?: boolean }) {
  const src = thumb ? sourceImg(sourceId, thumb, 120) : null;
  return (
    <div className="bg-muted relative h-12 w-8 shrink-0 overflow-hidden rounded border">
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="text-muted-foreground/40 flex h-full items-center justify-center">
          {isShow ? <Tv className="size-3.5" /> : <Clapperboard className="size-3.5" />}
        </div>
      )}
    </div>
  );
}

function ShowEpisodes({
  mediaSourceId,
  showKey,
  checked,
  toggle,
}: {
  mediaSourceId: string;
  showKey: string;
  checked: Set<string>;
  toggle: (keys: string | string[]) => void;
}) {
  const seasons = useQuery(
    trpc.channels.showEpisodes.queryOptions({ mediaSourceId, showRatingKey: showKey }, { enabled: !!mediaSourceId }),
  );
  if (seasons.isLoading) return <p className="text-muted-foreground py-1 pl-10 text-xs">Loading episodes…</p>;
  if (!seasons.data?.length) return <p className="text-muted-foreground py-1 pl-10 text-xs">No episodes.</p>;

  return (
    <div className="space-y-1 pl-10">
      {seasons.data.map((s) => {
        const epKeys = s.episodes.map((e) => e.ratingKey);
        const allOn = epKeys.every((k) => checked.has(k));
        return (
          <div key={s.season} className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium">
              <CheckCircle on={allOn} onClick={() => toggle(epKeys)} label={`Select all of season ${s.season}`} />
              Season {s.season}
              <span className="text-muted-foreground font-normal">
                {s.episodes.length} ep{s.episodes.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-0.5 pl-7">
              {s.episodes.map((e) => (
                <div key={e.ratingKey} className="flex items-center gap-2 text-xs">
                  <CheckCircle on={checked.has(e.ratingKey)} onClick={() => toggle(e.ratingKey)} label={`Select ${e.title}`} />
                  <span className="text-muted-foreground tabular-nums">
                    {se(s.season, e.episode) ?? `E${e.episode ?? "?"}`}
                  </span>
                  <span className="truncate">{e.title}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
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
  const [expandedShow, setExpandedShow] = useState<string | null>(null);

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
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
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

      {/* Results */}
      {debounced.length >= 2 && (
        <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
          {!hasResults ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              {results.isFetching ? "Searching…" : "No matches."}
            </p>
          ) : (
            <>
              {data.movies.length > 0 && (
                <Section label="Movies">
                  {data.movies.map((m) => (
                    <Row key={m.ratingKey}>
                      <CheckCircle on={checked.has(m.ratingKey)} onClick={() => toggle(m.ratingKey)} label={`Select ${m.title}`} />
                      <Thumb sourceId={mediaSourceId} thumb={m.guide?.thumb} />
                      <div className="min-w-0">
                        <p className="truncate text-sm">{m.title}</p>
                        {m.guide?.year != null && <p className="text-muted-foreground text-xs">{m.guide.year}</p>}
                      </div>
                    </Row>
                  ))}
                </Section>
              )}

              {data.shows.length > 0 && (
                <Section label="Shows">
                  {data.shows.map((s) => (
                    <div key={s.ratingKey}>
                      <Row>
                        <CheckCircle on={checked.has(s.ratingKey)} onClick={() => toggle(s.ratingKey)} label={`Select all of ${s.title}`} />
                        <Thumb sourceId={mediaSourceId} thumb={s.guide?.thumb} isShow />
                        <button
                          type="button"
                          onClick={() => setExpandedShow((cur) => (cur === s.ratingKey ? null : s.ratingKey))}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left"
                        >
                          {expandedShow === s.ratingKey ? (
                            <ChevronDown className="size-3.5 shrink-0" />
                          ) : (
                            <ChevronRight className="size-3.5 shrink-0" />
                          )}
                          <span className="truncate text-sm">{s.title}</span>
                        </button>
                      </Row>
                      {expandedShow === s.ratingKey && (
                        <ShowEpisodes mediaSourceId={mediaSourceId} showKey={s.ratingKey} checked={checked} toggle={toggle} />
                      )}
                    </div>
                  ))}
                </Section>
              )}

              {data.episodes.length > 0 && (
                <Section label="Episodes">
                  {data.episodes.map((e) => (
                    <Row key={e.ratingKey}>
                      <CheckCircle on={checked.has(e.ratingKey)} onClick={() => toggle(e.ratingKey)} label={`Select ${e.title}`} />
                      <Thumb sourceId={mediaSourceId} thumb={e.guide?.thumb} />
                      <div className="min-w-0">
                        <p className="truncate text-sm">
                          {e.guide?.showTitle ? `${e.guide.showTitle} — ` : ""}
                          {e.title}
                        </p>
                        {se(e.guide?.season, e.guide?.episode) && (
                          <p className="text-muted-foreground text-xs tabular-nums">{se(e.guide?.season, e.guide?.episode)}</p>
                        )}
                      </div>
                    </Row>
                  ))}
                </Section>
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
          <p className="text-muted-foreground text-sm">Nothing added yet. Search above and add items.</p>
        ) : (
          <div className="space-y-1">
            {(pool.data ?? []).map((it) => (
              <div key={it.ratingKey} className="flex items-center gap-2">
                <Thumb sourceId={mediaSourceId} thumb={it.thumb} isShow={it.type === "show"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {it.showTitle ? `${it.showTitle} — ` : ""}
                    {it.title}
                    {!it.available && <span className="text-muted-foreground"> (unavailable)</span>}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {it.type === "show"
                      ? "Whole show"
                      : it.type === "episode"
                        ? (se(it.season, it.episode) ?? "Episode")
                        : "Movie"}
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 py-0.5">{children}</div>;
}
