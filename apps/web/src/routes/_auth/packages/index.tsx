import { AccentIconTile } from "@ChannelGuide/ui/components/accent-icon-tile";
import { Button } from "@ChannelGuide/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@ChannelGuide/ui/components/dropdown-menu";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@ChannelGuide/ui/components/frame";
import { Input } from "@ChannelGuide/ui/components/input";
import { Skeleton } from "@ChannelGuide/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowUpDown, ChevronRight, Filter, LayoutGrid, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { HeaderLeft, HeaderRight, TopHeaderRight } from "@/context/header-provider";
import { resolveTile } from "@/features/icons/app-icon";
import { trpc, trpcClient } from "@/utils/trpc";

type SortKey = "order" | "name" | "channels";
const SORT_KEYS: SortKey[] = ["order", "name", "channels"];
const SORT_LABEL: Record<SortKey, string> = { order: "Order", name: "Name", channels: "Channels" };

/** URL-backed list state (search/filter/sort), forwarded to the server `packages.list`. Defaults
 *  omitted from the URL (empty = the default view). */
type Provenance = "preset" | "ai" | "manual";
type PackagesSearch = { q?: string; gen?: Provenance; sort?: SortKey; dir?: "desc" };
const PROVENANCE_LABEL: Record<Provenance, string> = { preset: "Auto", ai: "AI", manual: "Manual" };

export const Route = createFileRoute("/_auth/packages/")({
  validateSearch: (search: Record<string, unknown>): PackagesSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    gen:
      search.gen === "preset" || search.gen === "ai" || search.gen === "manual"
        ? (search.gen as Provenance)
        : undefined,
    sort: SORT_KEYS.includes(search.sort as SortKey) && search.sort !== "order" ? (search.sort as SortKey) : undefined,
    dir: search.dir === "desc" ? "desc" : undefined,
  }),
  component: PackagesList,
});

function PackagesList() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (patch: Partial<PackagesSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const sortKey: SortKey = search.sort ?? "order";
  const dir = search.dir ?? "asc";
  const activeFilters = search.gen ? 1 : 0;
  const hasFilters = !!(search.q?.trim() || activeFilters);
  const showPills = hasFilters || !!search.sort || !!search.dir;

  const packages = useQuery({
    ...trpc.packages.list.queryOptions({ q: search.q, gen: search.gen, sort: search.sort, dir: search.dir }),
    placeholderData: keepPreviousData,
  });
  const emptyResult = !!packages.data && packages.data.length === 0;

  const [refreshing, setRefreshing] = useState(false);
  const refreshStyling = async () => {
    setRefreshing(true);
    try {
      await trpcClient.generator.regeneratePackages.mutate();
      toast.success("Package styling refreshed from presets.");
      await packages.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      {/* New package + Refresh styling live in the TOP header's right slot (left of the AI Assistant
          button — `order-first` pulls them ahead of it). */}
      <TopHeaderRight>
        <Button variant="outline" size="sm" className="order-first" render={<Link to="/packages/new" />}>
          <Plus className="mr-2 h-4 w-4" /> New package
        </Button>
      </TopHeaderRight>

      {/* Active search/filter/sort as pills in the SUB-header's LEFT slot (or "All packages"). */}
      <HeaderLeft>
        {showPills ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {search.q?.trim() && <FilterPill label={`“${search.q}”`} onClear={() => setSearch({ q: undefined })} />}
            {search.gen && (
              <FilterPill label={PROVENANCE_LABEL[search.gen]} onClear={() => setSearch({ gen: undefined })} />
            )}
            {(search.sort || search.dir) && (
              <FilterPill
                label={`Sort: ${SORT_LABEL[sortKey]} ${dir === "desc" ? "↓" : "↑"}`}
                onClear={() => setSearch({ sort: undefined, dir: undefined })}
              />
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">All packages</span>
        )}
      </HeaderLeft>

      {/* Search / Filter / Sort in the SUB-header's right slot. */}
      <HeaderRight>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2" />
            <Input
              value={search.q ?? ""}
              onChange={(e) => setSearch({ q: e.target.value || undefined })}
              placeholder="Search…"
              className="h-7 w-44 pl-7 text-xs"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" />}>
              <Filter className="mr-1.5 size-3.5" />
              Filter
              {activeFilters > 0 && (
                <span className="bg-primary/15 text-primary ml-1.5 rounded-full px-1.5 text-xs tabular-nums">
                  {activeFilters}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Sparkles className="mr-2 size-4" />
                  Type
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={search.gen ?? "all"}
                    onValueChange={(v) => setSearch({ gen: v === "all" ? undefined : (v as Provenance) })}
                  >
                    <DropdownMenuRadioItem value="all">Any</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="preset">Auto (preset)</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="ai">AI-generated</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="manual">Manual</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {activeFilters > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSearch({ gen: undefined })}>Clear filters</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" />}>
              <ArrowUpDown className="mr-1.5 size-3.5" />
              Sort
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuRadioGroup
                value={sortKey}
                onValueChange={(v) => setSearch({ sort: v === "order" ? undefined : (v as SortKey) })}
              >
                <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                {SORT_KEYS.map((k) => (
                  <DropdownMenuRadioItem key={k} value={k}>
                    {SORT_LABEL[k]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={dir}
                onValueChange={(v) => setSearch({ dir: v === "desc" ? "desc" : undefined })}
              >
                <DropdownMenuLabel>Direction</DropdownMenuLabel>
                <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </HeaderRight>

      <Frame>
        <FrameHeader className="flex-row items-center justify-between gap-4">
          <div>
            <FrameTitle>Packages</FrameTitle>
            <FrameDescription>
              Packages group channels into a lineup (e.g. "Kids &amp; Family"). Assign a channel to a
              package from its edit page.
            </FrameDescription>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={refreshStyling} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Refresh styling
          </Button>
        </FrameHeader>
        <FramePanel className="p-0">
          {packages.isLoading ? (
            <PackageListSkeleton />
          ) : emptyResult && hasFilters ? (
            <EmptyState
              icon={Search}
              title="No packages match"
              description="Try a different search or clear the filters."
              action={
                <Button size="sm" variant="outline" onClick={() => void navigate({ search: () => ({}), replace: true })}>
                  Clear filters
                </Button>
              }
            />
          ) : emptyResult ? (
            <EmptyState
              icon={LayoutGrid}
              title="No packages yet"
              description="Packages group channels into a lineup (e.g. “Kids & Family”). Create one to organize your guide."
              action={
                <Button size="sm" render={<Link to="/packages/new" />}>
                  <Plus className="mr-1 h-4 w-4" /> New package
                </Button>
              }
            />
          ) : (
            <div className="divide-border divide-y">
              {packages.data?.map((p) => {
                const tile = resolveTile({
                  icon: p.icon,
                  tint: p.tint,
                  defaultIcon: LayoutGrid,
                  defaultTint: "violet",
                });
                return (
                  <Link
                    key={p.id}
                    to="/packages/$packageId"
                    params={{ packageId: p.id }}
                    className="hover:bg-accent/50 flex items-center gap-3 p-4 transition-colors"
                  >
                    <AccentIconTile icon={tile.Icon} tint={tile.tint} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {p.name}
                        {p.generated && (
                          <span className="border-border text-muted-foreground rounded border px-1 text-[10px] uppercase">
                            Auto
                          </span>
                        )}
                        {p.aiGenerated && (
                          <span className="rounded border border-violet-500/30 px-1 text-[10px] uppercase text-violet-600">
                            AI
                          </span>
                        )}
                      </p>
                      {p.description && (
                        <p className="text-muted-foreground truncate text-xs">{p.description}</p>
                      )}
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {p.channelCount} channel{p.channelCount === 1 ? "" : "s"}
                    </span>
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  </Link>
                );
              })}
            </div>
          )}
        </FramePanel>
      </Frame>
    </div>
  );
}

/** A dismissible active-filter/sort pill for the sub-header. */
function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="bg-muted text-muted-foreground inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs">
      <span className="max-w-[12rem] truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        className="hover:bg-foreground/10 hover:text-foreground rounded-full p-0.5"
        aria-label={`Clear ${label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** Shimmer placeholder rows while the package list loads. */
function PackageListSkeleton() {
  return (
    <div className="divide-border divide-y">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-7 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
