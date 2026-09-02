import { Button } from "@airwave/ui/components/button";
import { Checkbox } from "@airwave/ui/components/checkbox";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@airwave/ui/components/collapsible";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@airwave/ui/components/frame";
import { Input } from "@airwave/ui/components/input";
import { Label } from "@airwave/ui/components/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@airwave/ui/components/select";
import { Switch } from "@airwave/ui/components/switch";
import { Textarea } from "@airwave/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Info, Layers, ListFilter, SlidersHorizontal, Tv, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { HeaderRight } from "@/context/header-provider";
import { IconTintField } from "@/features/icons/icon-tint-field";
import { trpc } from "@/utils/trpc";

import { FilterBuilder, type FilterGroup, normalizeFilter } from "./filter-builder";
import { StrategyEditor, type ChannelStrategy } from "./strategy-editor";

export type Ordering = "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";
export type MediaType = "movie" | "show";
export type BumperMode = "INHERIT" | "OFF" | "INTERSTITIAL_ONLY" | "FULL";

export type ChannelFormValues = {
  name: string;
  callsign: string;
  number: string;
  mediaTypes: MediaType[];
  filter: FilterGroup;
  ordering: Ordering;
  strategy: ChannelStrategy | null;
  sortField: string;
  sortDir: "asc" | "desc";
  packageId: string | null;
  icon: string | null;
  tint: string | null;
  description: string | null;
  enabled: boolean;
  bumperMode: BumperMode;
};

/** The live filter state the form reports upward (via `onPreviewInputChange`) so a preview panel can resolve
 *  the UNSAVED filter — see channels.previewFilter (GitHub #12). */
export type ChannelPreviewInput = {
  mediaSourceId: string;
  mediaTypes: MediaType[];
  filter: FilterGroup;
  sortField: string;
  sortDir: "asc" | "desc";
};

const BUMPER_MODE_OPTIONS: { value: BumperMode; label: string }[] = [
  { value: "INHERIT", label: "Inherit global setting" },
  { value: "OFF", label: "Off — no bumpers" },
  { value: "INTERSTITIAL_ONLY", label: "Interstitial only" },
  { value: "FULL", label: "Full — interstitial + commercials" },
];

/**
 * One collapsible section. The toggle is a standard inline-width ghost button — an icon, the
 * title, then the chevron right after it — sitting on the muted Frame; the section's CONTENT is
 * a raised FramePanel that animates open/closed. Independent open state, several open at once.
 */
function Section({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      {/* `ms-2.5` insets the trigger so its icon lines up with the px-5 content of the header
          above and the FramePanel below. `aria-expanded:bg-transparent` cancels the ghost
          variant's `aria-expanded:bg-muted` — otherwise an OPEN section keeps a faint bg. */}
      <CollapsibleTrigger
        className="ms-2.5 gap-2 font-semibold aria-expanded:bg-transparent data-panel-open:[&>svg:last-child]:rotate-180"
        render={<Button variant="ghost" size="sm" type="button" />}
      >
        <Icon className="size-4 shrink-0" />
        {title}
        <ChevronDown className="text-muted-foreground size-4 shrink-0 transition-transform" />
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <FramePanel className="mt-2 space-y-4">{children}</FramePanel>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/**
 * Channel create/edit fields as a `<form id={formId}>` with NO submit button —
 * the save button lives in the route header (HeaderRight). A channel mixes
 * Movies + TV and filters via the nested predicate builder. Fields are grouped into
 * independent collapsible sections; the Filter is last (it's the biggest, and the preview
 * tiles render right below the form).
 */
export function ChannelForm({
  initial,
  formId,
  title,
  subtitle,
  onSubmit,
  onPreviewInputChange,
}: {
  initial?: Partial<ChannelFormValues>;
  formId: string;
  /** Frame title — the form IS the container now (no outer Card), so it carries its own heading. */
  title?: string;
  /** Frame subtitle under the title (named `subtitle`, not `description`, to avoid colliding with
   *  the channel's own description field). */
  subtitle?: string;
  onSubmit: (values: ChannelFormValues & { mediaSourceId: string }) => void;
  /** Reports the live filter/source/sort upward so a preview panel can resolve the UNSAVED filter (#12).
   *  Pass a stable setter (e.g. a useState setter) — it's called from an effect on every relevant change. */
  onPreviewInputChange?: (input: ChannelPreviewInput) => void;
}) {
  const sources = useQuery(trpc.sources.list.queryOptions());
  // Only a READY source (connected + synced) can back a channel; fall back to the first ready one.
  const sourceId = sources.data?.find((s) => s.ready)?.id ?? "";
  const packages = useQuery(trpc.packages.list.queryOptions());
  const sortFields = useQuery(trpc.channels.sortFields.queryOptions());

  const initialTypes = initial?.mediaTypes ?? ["movie", "show"];
  const [name, setName] = useState(initial?.name ?? "");
  const [callsign, setCallsign] = useState(initial?.callsign ?? "");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [movies, setMovies] = useState(initialTypes.includes("movie"));
  const [tv, setTv] = useState(initialTypes.includes("show"));
  const [ordering, setOrdering] = useState<Ordering>(initial?.ordering ?? "SHUFFLE");
  const [strategy, setStrategy] = useState<ChannelStrategy | null>(initial?.strategy ?? null);
  const [sortField, setSortField] = useState(initial?.sortField ?? "title");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initial?.sortDir ?? "asc");
  const [packageId, setPackageId] = useState<string>(initial?.packageId ?? "");
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [tint, setTint] = useState<string | null>(initial?.tint ?? null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [bumperMode, setBumperMode] = useState<BumperMode>(initial?.bumperMode ?? "INHERIT");
  const [filter, setFilter] = useState<FilterGroup>(() => normalizeFilter(initial?.filter));

  const selectedPackage = packages.data?.find((p) => p.id === packageId);

  const mediaTypes: MediaType[] = [
    ...(movies ? (["movie"] as const) : []),
    ...(tv ? (["show"] as const) : []),
  ];

  // Report the live filter/source/sort upward so a preview panel can resolve the UNSAVED filter (#12). Fires
  // whenever the builder, media types, sort, or the resolved source changes; `mediaTypes` is rebuilt inside from
  // the `movies`/`tv` deps (it's a fresh array each render, so it can't be a dep itself).
  useEffect(() => {
    onPreviewInputChange?.({ mediaSourceId: sourceId, mediaTypes, filter, sortField, sortDir });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, movies, tv, filter, sortField, sortDir, onPreviewInputChange]);

  if (sources.data && !sourceId) {
    // No usable source — say exactly which step is missing so the fix is obvious.
    const anyConnected = sources.data.some((s) => s.connected);
    const message =
      sources.data.length === 0
        ? "Connect a Plex server before creating channels."
        : !anyConnected
          ? "No media source is connected to a server yet — connect one before creating channels."
          : "Run a metadata sync on a source before creating channels — there's no synced media to build from yet.";
    return (
      <p className="text-muted-foreground text-sm">
        {message}{" "}
        Go to{" "}
        <Link to="/sources" className="text-primary hover:underline">
          Sources
        </Link>
        .
      </p>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (mediaTypes.length === 0) {
      toast.error("Pick at least one content type.");
      return;
    }
    onSubmit({
      name,
      callsign,
      number,
      mediaTypes,
      filter,
      ordering,
      strategy,
      sortField,
      sortDir,
      packageId: packageId || null,
      icon,
      tint,
      description: description.trim() || null,
      enabled,
      bumperMode,
      mediaSourceId: sourceId,
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit}>
      {/* Active is a channel-status toggle, not a form field — it lives in the sub-header's
          right portal (order-first, so it sits left of Watch/Save). Portaled out of the <form>
          but still wired to `enabled`, which handleSubmit reads from React state. */}
      <HeaderRight>
        <label
          className="order-first mr-1 flex items-center gap-2 text-sm"
          title="Inactive channels aren't selectable in the guide"
        >
          <Switch checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
          Active
        </label>
      </HeaderRight>

      {/* Frame (muted) → header (title + subtitle) → per-section collapsibles. Each section's
          toggle is on the muted Frame; its content is a raised FramePanel. gap-3 gives the
          triggers breathing room from each other and their panels. */}
      <Frame className="gap-3 p-2">
        {(title || subtitle) && (
          <FrameHeader>
            {title && <FrameTitle>{title}</FrameTitle>}
            {subtitle && <FrameDescription>{subtitle}</FrameDescription>}
          </FrameHeader>
        )}
        <Section title="Details" icon={Info}>
        {/* Fixed side-column widths (not `auto`) + items-end so the three input boxes line up
            on one baseline regardless of label width. */}
        <div className="grid grid-cols-[1fr_7rem_7rem] items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="cname">Name</Label>
            <Input
              id="cname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="90s Comedies"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ccall">Callsign</Label>
            <Input
              id="ccall"
              className="uppercase"
              value={callsign}
              maxLength={6}
              onChange={(e) => setCallsign(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="90SCOM"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cnum">Number</Label>
            <Input
              id="cnum"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="auto"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cdesc">Description</Label>
          <Textarea
            id="cdesc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional — what this channel is for."
          />
        </div>

      </Section>

      {/* Package + ordering + bumpers + appearance grouped as one "Options" section. */}
      <Section title="Options" icon={SlidersHorizontal}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cpkg">Package</Label>
            <Select value={packageId} onValueChange={(v) => setPackageId(v ?? "")}>
              <SelectTrigger id="cpkg" className="w-full">
                <SelectValue>
                  {(v) => (v ? (packages.data?.find((p) => p.id === v)?.name ?? "…") : "None")}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="">None</SelectItem>
                {packages.data?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cord">Ordering</Label>
            <Select
              value={ordering === "SHUFFLE" ? "SHUFFLE" : "SORTED"}
              onValueChange={(v) => setOrdering(v === "SHUFFLE" ? "SHUFFLE" : "IN_ORDER")}
            >
              <SelectTrigger id="cord" className="w-full">
                <SelectValue>{(v) => (v === "SHUFFLE" ? "Shuffle" : "Sorted by…")}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="SHUFFLE">Shuffle</SelectItem>
                <SelectItem value="SORTED">Sorted by…</SelectItem>
              </SelectPopup>
            </Select>
          </div>
        </div>

        {ordering !== "SHUFFLE" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="csort">Sort by</Label>
              <Select value={sortField} onValueChange={(v) => setSortField(v ?? "title")}>
                <SelectTrigger id="csort" className="w-full">
                  <SelectValue>
                    {(v) => sortFields.data?.find((s) => s.field === v)?.label ?? "Select…"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {sortFields.data?.map((s) => (
                    <SelectItem key={s.field} value={s.field}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cdir">Direction</Label>
              <Select value={sortDir} onValueChange={(v) => setSortDir(v as "asc" | "desc")}>
                <SelectTrigger id="cdir" className="w-full">
                  <SelectValue>{(v) => (v === "desc" ? "Descending" : "Ascending")}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectPopup>
              </Select>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cbump">Bumpers</Label>
            <Select value={bumperMode} onValueChange={(v) => setBumperMode(v as BumperMode)}>
              <SelectTrigger id="cbump" className="w-full">
                <SelectValue>
                  {(v) => BUMPER_MODE_OPTIONS.find((o) => o.value === v)?.label ?? "Select…"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {BUMPER_MODE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <p className="text-muted-foreground text-xs">
              Break content is configured globally in{" "}
              <Link to="/bumpers" className="text-primary hover:underline">
                Bumpers
              </Link>
              . Channels only choose whether/which to show.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Appearance</Label>
          <IconTintField
            icon={icon}
            tint={tint}
            onIconChange={setIcon}
            onTintChange={setTint}
            inheritedIcon={selectedPackage?.icon}
            inheritedTint={selectedPackage?.tint}
            defaultIcon={Tv}
          />
          {selectedPackage && !tint && !icon && (
            <p className="text-muted-foreground text-xs">
              Inherits “{selectedPackage.name}” — pick an icon or tint to override.
            </p>
          )}
        </div>
      </Section>

      {/* Content types + filter together, LAST — they jointly define what plays, and the
          resolved preview tiles render right below the form. */}
      <Section title="Content & filter" icon={ListFilter}>
        <div className="space-y-2">
          <Label>Content</Label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox checked={movies} onCheckedChange={(v) => setMovies(v === true)} />
              Movies
            </label>
            <label className="flex items-center gap-2">
              <Checkbox checked={tv} onCheckedChange={(v) => setTv(v === true)} />
              TV Shows
            </label>
          </div>
        </div>
        <FilterBuilder
          value={filter}
          onChange={setFilter}
          mediaSourceId={sourceId}
          mediaTypes={mediaTypes}
        />
      </Section>

      {/* Advanced grouping/rotation strategy — collapsed by default so a basic channel stays simple, but
          auto-expanded when this channel ALREADY has a strategy (so it's not hidden). Optional; off = plays in
          the order set above (byte-for-byte today's behavior). */}
      <Section title="Advanced — grouping & rotation" icon={Layers} defaultOpen={strategy != null}>
        <StrategyEditor
          value={strategy}
          onChange={setStrategy}
          mediaSourceId={sourceId}
          mediaTypes={mediaTypes}
        />
      </Section>
      </Frame>
    </form>
  );
}
