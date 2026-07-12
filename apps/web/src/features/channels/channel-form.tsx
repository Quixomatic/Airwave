import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { Textarea } from "@ChannelGuide/ui/components/textarea";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Tv } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { IconTintField } from "@/features/icons/icon-tint-field";
import { trpc } from "@/utils/trpc";

import { FilterBuilder, type FilterGroup, emptyGroup } from "./filter-builder";

export type Ordering = "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";
export type MediaType = "movie" | "show";

export type ChannelFormValues = {
  name: string;
  number: string;
  mediaTypes: MediaType[];
  filter: FilterGroup;
  ordering: Ordering;
  packageId: string | null;
  icon: string | null;
  tint: string | null;
  description: string | null;
};

/**
 * Channel create/edit fields as a `<form id={formId}>` with NO submit button —
 * the save button lives in the route header (HeaderRight). A channel mixes
 * Movies + TV and filters via the nested predicate builder.
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

  const initialTypes = initial?.mediaTypes ?? ["movie", "show"];
  const [name, setName] = useState(initial?.name ?? "");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [movies, setMovies] = useState(initialTypes.includes("movie"));
  const [tv, setTv] = useState(initialTypes.includes("show"));
  const [ordering, setOrdering] = useState<Ordering>(initial?.ordering ?? "SHUFFLE");
  const [packageId, setPackageId] = useState<string>(initial?.packageId ?? "");
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [tint, setTint] = useState<string | null>(initial?.tint ?? null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [filter, setFilter] = useState<FilterGroup>(() => initial?.filter ?? emptyGroup());

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
      number,
      mediaTypes,
      filter,
      ordering,
      packageId: packageId || null,
      icon,
      tint,
      description: description.trim() || null,
      mediaSourceId: sourceId,
    });
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-[1fr_auto] gap-3">
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
          <Label htmlFor="cnum">Number</Label>
          <Input
            id="cnum"
            className="w-24"
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

      <div className="space-y-2">
        <Label>Content</Label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={movies} onChange={(e) => setMovies(e.target.checked)} />
            Movies
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={tv} onChange={(e) => setTv(e.target.checked)} />
            TV Shows
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Filter</Label>
        <FilterBuilder
          value={filter}
          onChange={setFilter}
          mediaSourceId={sourceId}
          mediaTypes={mediaTypes}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cord">Ordering</Label>
          <select
            id="cord"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={ordering}
            onChange={(e) => setOrdering(e.target.value as Ordering)}
          >
            <option value="SHUFFLE">Shuffle</option>
            <option value="IN_ORDER">In order</option>
            <option value="BY_AIR_DATE">By air date</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cpkg">Package</Label>
          <select
            id="cpkg"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
          >
            <option value="">None</option>
            {packages.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
    </form>
  );
}
