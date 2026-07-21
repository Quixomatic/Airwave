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
import { Switch } from "@ChannelGuide/ui/components/switch";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUpDown,
  Blocks,
  Filter,
  LayoutGrid,
  ListOrdered,
  Loader2,
  Plus,
  Power,
  Search,
  Server,
  Sparkles,
  Tv,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Modal } from "@/components/modal";
import { HeaderLeft, HeaderRight, TopHeaderRight } from "@/context/header-provider";
import { resolveTile } from "@/features/icons/app-icon";
import { trpc, trpcClient } from "@/utils/trpc";

type SortKey = "number" | "name" | "callsign" | "status" | "package";
const SORT_KEYS: SortKey[] = ["number", "name", "callsign", "status", "package"];
const SORT_LABEL: Record<SortKey, string> = {
  number: "Number",
  name: "Name",
  callsign: "Callsign",
  status: "Status",
  package: "Package",
};

type Ordering = "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";
const ORDERINGS: Ordering[] = ["SHUFFLE", "IN_ORDER", "BY_AIR_DATE"];
const ORDERING_LABEL: Record<Ordering, string> = {
  SHUFFLE: "Shuffle",
  IN_ORDER: "In order",
  BY_AIR_DATE: "By air date",
};

/** URL-backed list state — so search/filter/sort survive reload and are shareable. Defaults are
 *  omitted from the URL (empty = the default view). The actual work happens server-side; these are
 *  forwarded to `channels.list`. */
type ChannelsSearch = {
  q?: string;
  pkg?: string;
  ordering?: Ordering;
  status?: "active" | "inactive";
  sort?: SortKey;
  dir?: "desc";
};

export const Route = createFileRoute("/_auth/channels/")({
  validateSearch: (search: Record<string, unknown>): ChannelsSearch => ({
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    pkg: typeof search.pkg === "string" && search.pkg ? search.pkg : undefined,
    ordering: ORDERINGS.includes(search.ordering as Ordering) ? (search.ordering as Ordering) : undefined,
    status: search.status === "active" || search.status === "inactive" ? search.status : undefined,
    sort: SORT_KEYS.includes(search.sort as SortKey) && search.sort !== "number" ? (search.sort as SortKey) : undefined,
    dir: search.dir === "desc" ? "desc" : undefined,
  }),
  component: ChannelsList,
});

function ChannelsList() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (patch: Partial<ChannelsSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const sortKey: SortKey = search.sort ?? "number";
  const dir = search.dir ?? "asc";
  const activeFilters = [search.pkg, search.ordering, search.status].filter(Boolean).length;
  const hasFilters = !!(search.q?.trim() || activeFilters);
  const showPills = hasFilters || !!search.sort || !!search.dir;

  // Server does the search/filter/sort; keep the previous rows visible while a param change refetches.
  const channels = useQuery({
    ...trpc.channels.list.queryOptions({
      q: search.q,
      pkg: search.pkg,
      ordering: search.ordering,
      status: search.status,
      sort: search.sort,
      dir: search.dir,
    }),
    placeholderData: keepPreviousData,
  });
  const packages = useQuery(trpc.packages.list.queryOptions()); // full list, for the package filter
  const sources = useQuery(trpc.sources.list.queryOptions());
  // Channel creation needs a READY source (connected + synced). Block it (here and in the API) until
  // one exists. Only block once sources have loaded, so we don't flicker the button on first paint.
  const blockCreate = !!sources.data && !sources.data.some((s) => s.ready);
  const emptyResult = !!channels.data && channels.data.length === 0;

  const jobs = useQuery({
    ...trpc.jobs.list.queryOptions(),
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.id === "lineup-generate" && j.running) ? 1500 : false,
  });
  const genJob = jobs.data?.find((j) => j.id === "lineup-generate");
  const generating = genJob?.running ?? false;

  // Refetch the channel list whenever a generation run completes.
  useEffect(() => {
    void channels.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genJob?.lastFinishedAt]);

  const ai = useQuery(trpc.ai.list.queryOptions());
  const aiConns = ai.data ?? [];
  const aiHasActive = aiConns.some((c) => c.isActive);
  // The AI lineup needs a planner + worker; both fall back to the chat (active) connection, so it's
  // available as long as something resolves for each.
  const aiAvailable =
    (aiConns.some((c) => c.isPlanner) || aiHasActive) && (aiConns.some((c) => c.isWorker) || aiHasActive);
  const [genOpen, setGenOpen] = useState(false);
  const [genRunning, setGenRunning] = useState(false);

  const runGenerator = async (id: "lineup-generate" | "ai-lineup-build") => {
    setGenRunning(true);
    try {
      await trpcClient.jobs.run.mutate({ id });
      toast.success(
        id === "lineup-generate"
          ? "Generating lineup…"
          : "AI lineup build started — watch progress under Settings → Workflows.",
      );
      await jobs.refetch();
      setGenOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start generation");
    } finally {
      setGenRunning(false);
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await trpcClient.channels.setEnabled.mutate({ id, enabled });
      await channels.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update channel");
    }
  };

  return (
    <div>
      {/* New channel + Auto-generate both live in the TOP header's right slot (left of the AI
          Assistant button — `order-first` pulls them ahead of it). */}
      <TopHeaderRight>
        {blockCreate ? (
          <Button variant="outline" size="sm" className="order-first" disabled title="Connect and sync a media source first">
            <Plus className="mr-2 h-4 w-4" />
            New channel
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="order-first" render={<Link to="/channels/new" />}>
            <Plus className="mr-2 h-4 w-4" />
            New channel
          </Button>
        )}
      </TopHeaderRight>

      {/* Active search/filter/sort as dismissible pills in the SUB-header's LEFT slot (or a plain
          "All channels" label when nothing is applied). */}
      <HeaderLeft>
        {showPills ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {search.q?.trim() && (
              <FilterPill label={`“${search.q}”`} onClear={() => setSearch({ q: undefined })} />
            )}
            {search.pkg && (
              <FilterPill
                label={`Package: ${search.pkg === "none" ? "Unassigned" : (packages.data?.find((p) => p.id === search.pkg)?.name ?? "…")}`}
                onClear={() => setSearch({ pkg: undefined })}
              />
            )}
            {search.ordering && (
              <FilterPill label={ORDERING_LABEL[search.ordering]} onClear={() => setSearch({ ordering: undefined })} />
            )}
            {search.status && (
              <FilterPill
                label={search.status === "active" ? "Active" : "Inactive"}
                onClear={() => setSearch({ status: undefined })}
              />
            )}
            {(search.sort || search.dir) && (
              <FilterPill
                label={`Sort: ${SORT_LABEL[sortKey]} ${dir === "desc" ? "↓" : "↑"}`}
                onClear={() => setSearch({ sort: undefined, dir: undefined })}
              />
            )}
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">All channels</span>
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

          {/* Filter — pick a field, then a value. */}
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
                  <LayoutGrid className="mr-2 size-4" />
                  Package
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={search.pkg ?? "all"}
                    onValueChange={(v) => setSearch({ pkg: v === "all" ? undefined : v })}
                  >
                    <DropdownMenuRadioItem value="all">All packages</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="none">Unassigned</DropdownMenuRadioItem>
                    {(packages.data ?? []).map((p) => (
                      <DropdownMenuRadioItem key={p.id} value={p.id}>
                        {p.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ListOrdered className="mr-2 size-4" />
                  Order type
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={search.ordering ?? "all"}
                    onValueChange={(v) => setSearch({ ordering: v === "all" ? undefined : (v as Ordering) })}
                  >
                    <DropdownMenuRadioItem value="all">Any</DropdownMenuRadioItem>
                    {ORDERINGS.map((o) => (
                      <DropdownMenuRadioItem key={o} value={o}>
                        {ORDERING_LABEL[o]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Power className="mr-2 size-4" />
                  Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    value={search.status ?? "all"}
                    onValueChange={(v) => setSearch({ status: v === "all" ? undefined : (v as "active" | "inactive") })}
                  >
                    <DropdownMenuRadioItem value="all">Any</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="inactive">Inactive</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {activeFilters > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setSearch({ pkg: undefined, ordering: undefined, status: undefined })}>
                    Clear filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sort — pick a field + a direction. */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" />}>
              <ArrowUpDown className="mr-1.5 size-3.5" />
              Sort
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuRadioGroup
                value={sortKey}
                onValueChange={(v) => setSearch({ sort: v === "number" ? undefined : (v as SortKey) })}
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
            <FrameTitle>Channels</FrameTitle>
            <FrameDescription>Live channels built from your enabled libraries.</FrameDescription>
          </div>
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setGenOpen(true)} disabled={generating}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Auto-generate
          </Button>
        </FrameHeader>

        {generating && (
          <div className="border-primary/30 bg-primary/5 rounded-md border px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="text-primary h-4 w-4 animate-spin" />
              <span>
                Generating lineup{genJob?.progress ? ` — ${genJob.progress.label}` : ""}
                {genJob?.progress && genJob.progress.total > 0
                  ? ` (${genJob.progress.current}/${genJob.progress.total})`
                  : ""}
              </span>
            </div>
          </div>
        )}

        <FramePanel className="p-0">
          {channels.isLoading ? (
            <ChannelListSkeleton />
          ) : emptyResult && hasFilters ? (
            <EmptyState
              icon={Search}
              title="No channels match"
              description="Try a different search or clear the filters."
              action={
                <Button size="sm" variant="outline" onClick={() => void navigate({ search: () => ({}), replace: true })}>
                  Clear filters
                </Button>
              }
            />
          ) : emptyResult ? (
            blockCreate ? (
              <EmptyState
                icon={Server}
                title="Connect a media source first"
                description="Channels are built from a synced media source. Connect one and run a metadata sync to get started."
                action={
                  <Button size="sm" render={<Link to="/sources" />}>
                    <Server className="mr-2 h-4 w-4" />
                    Go to Sources
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Tv}
                title="No channels yet"
                description="Build a channel from your enabled libraries, or use Auto-generate for a full lineup."
                action={
                  <Button size="sm" render={<Link to="/channels/new" />}>
                    <Plus className="mr-2 h-4 w-4" />
                    New channel
                  </Button>
                }
              />
            )
          ) : (
            <ul className="divide-y">
              {channels.data?.map((c) => {
                const tile = resolveTile({
                  icon: c.icon,
                  tint: c.tint,
                  inheritedIcon: c.package?.icon,
                  inheritedTint: c.package?.tint,
                  defaultIcon: Tv,
                });
                return (
                  <li key={c.id} className="flex items-center">
                    <Link
                      to="/channels/$channelId"
                      params={{ channelId: c.id }}
                      className={`hover:bg-muted/50 flex flex-1 items-center gap-3 px-4 py-3 ${c.enabled ? "" : "opacity-50"}`}
                    >
                      <span className="text-muted-foreground w-8 text-sm tabular-nums">{c.number}</span>
                      <AccentIconTile icon={tile.Icon} tint={tile.tint} size="lg" />
                      <span className="flex-1 truncate text-sm font-medium">
                        {c.name}
                        {c.callsign && (
                          <span className="text-muted-foreground ml-2 font-mono text-xs">{c.callsign}</span>
                        )}
                      </span>
                      {!c.enabled && (
                        <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-xs">
                          Inactive
                        </span>
                      )}
                      {c.package && (
                        <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                          {c.package.name}
                        </span>
                      )}
                      <span className="text-muted-foreground text-xs capitalize">
                        {c.ordering.toLowerCase().replace("_", " ")}
                      </span>
                    </Link>
                    <label
                      className="px-4"
                      title={c.enabled ? "Active — click to deactivate" : "Inactive — click to activate"}
                    >
                      <Switch checked={c.enabled} onCheckedChange={(v) => toggle(c.id, v === true)} />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </FramePanel>
      </Frame>

      <Modal open={genOpen} onClose={() => !genRunning && setGenOpen(false)} className="max-w-lg">
        <h2 className="font-semibold">Generate a lineup</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Pick how to build your channels. Each rebuilds only the channels it created before — your
          manual channels are untouched.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <GeneratorTile
            icon={Blocks}
            title="Preset generator"
            desc="Rebuild the lineup from the built-in preset catalog. Fast, deterministic, and needs no AI."
            onClick={() => void runGenerator("lineup-generate")}
            disabled={genRunning}
          />
          <GeneratorTile
            icon={Sparkles}
            title="AI lineup"
            desc="Design a custom lineup with AI, curated from your library's actual content."
            onClick={() => void runGenerator("ai-lineup-build")}
            disabled={genRunning || !aiAvailable}
            footer={
              !aiAvailable ? (
                <Link to="/settings/ai" className="text-primary mt-2 inline-block text-xs hover:underline">
                  Requires an AI connection — set one up →
                </Link>
              ) : undefined
            }
          />
        </div>
      </Modal>
    </div>
  );
}

/** One choice in the Auto-generate picker — a big tile. Disabled tiles (e.g. AI without a
 *  connection) render as a dimmed card that can still show a footer link. */
function GeneratorTile({
  icon: Icon,
  title,
  desc,
  onClick,
  disabled,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  onClick: () => void;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const body = (
    <>
      <div className="bg-muted mb-2.5 flex size-10 items-center justify-center rounded-lg">
        <Icon className="size-5" />
      </div>
      <div className="font-medium">{title}</div>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{desc}</p>
    </>
  );
  if (disabled) {
    return (
      <div className="rounded-xl border p-4 opacity-70">
        {body}
        {footer}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-ring rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      {body}
    </button>
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

/** Shimmer placeholder rows while the channel list loads. */
function ChannelListSkeleton() {
  return (
    <ul className="divide-y">
      {Array.from({ length: 8 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-4 w-6" />
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="ml-auto h-5 w-9 rounded-full" />
        </li>
      ))}
    </ul>
  );
}
