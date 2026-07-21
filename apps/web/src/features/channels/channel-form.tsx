import { Checkbox } from "@ChannelGuide/ui/components/checkbox";
import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@ChannelGuide/ui/components/select";
import { Switch } from "@ChannelGuide/ui/components/switch";
import { Textarea } from "@ChannelGuide/ui/components/textarea";
import { cn } from "@ChannelGuide/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Tv } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { IconTintField } from "@/features/icons/icon-tint-field";
import { trpc } from "@/utils/trpc";

import { FilterBuilder, type FilterGroup, normalizeFilter } from "./filter-builder";

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
  sortField: string;
  sortDir: "asc" | "desc";
  packageId: string | null;
  icon: string | null;
  tint: string | null;
  description: string | null;
  enabled: boolean;
  bumperMode: BumperMode;
};

const BUMPER_MODE_OPTIONS: { value: BumperMode; label: string }[] = [
  { value: "INHERIT", label: "Inherit global setting" },
  { value: "OFF", label: "Off — no bumpers" },
  { value: "INTERSTITIAL_ONLY", label: "Interstitial only" },
  { value: "FULL", label: "Full — interstitial + commercials" },
];

/**
 * One collapsible section of the form — independent (its own open state, several can be open
 * at once), with a heading that toggles it. Not an accordion on purpose: editing a channel
 * often means having a couple of sections open together.
 */
function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-3 text-left text-sm font-medium"
      >
        {title}
        <ChevronDown
          className={cn("text-muted-foreground h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="space-y-4 pb-4">{children}</div>}
    </div>
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
  onSubmit,
}: {
  initial?: Partial<ChannelFormValues>;
  formId: string;
  onSubmit: (values: ChannelFormValues & { mediaSourceId: string }) => void;
}) {
  const sources = useQuery(trpc.sources.list.queryOptions());
  const sourceId = sources.data?.[0]?.id ?? "";
  const packages = useQuery(trpc.packages.list.queryOptions());
  const sortFields = useQuery(trpc.channels.sortFields.queryOptions());

  const initialTypes = initial?.mediaTypes ?? ["movie", "show"];
  const [name, setName] = useState(initial?.name ?? "");
  const [callsign, setCallsign] = useState(initial?.callsign ?? "");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [movies, setMovies] = useState(initialTypes.includes("movie"));
  const [tv, setTv] = useState(initialTypes.includes("show"));
  const [ordering, setOrdering] = useState<Ordering>(initial?.ordering ?? "SHUFFLE");
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

  if (sources.data && !sourceId) {
    return (
      <p className="text-muted-foreground text-sm">
        Connect a Plex server in{" "}
        <Link to="/sources" className="text-primary hover:underline">
          Sources
        </Link>{" "}
        first.
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
    <form id={formId} onSubmit={handleSubmit} className="divide-y">
      <Section title="Details">
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

        <label className="flex items-center gap-2 text-sm">
          <Switch checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
          Active
          <span className="text-muted-foreground text-xs">
            — inactive channels aren't selectable in the guide
          </span>
        </label>
      </Section>

      {/* Package + ordering + bumpers + appearance grouped as one "Options" section. */}
      <Section title="Options">
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
      <Section title="Content & filter">
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
    </form>
  );
}
