import { Input } from "@ChannelGuide/ui/components/input";
import { Label } from "@ChannelGuide/ui/components/label";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

export type Ordering = "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";
export type MediaType = "movie" | "show";

export type ChannelFormValues = {
  name: string;
  number: string;
  mediaTypes: MediaType[];
  genreTitle: string;
  unwatched: boolean;
  ordering: Ordering;
};

/**
 * Channel create/edit fields as a `<form id={formId}>` with NO submit button —
 * the submit/save button lives in the route header (HeaderRight). A channel can
 * mix Movies + TV; genre is by title (resolved per library at query time).
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

  const initialTypes = initial?.mediaTypes ?? ["movie", "show"];
  const [name, setName] = useState(initial?.name ?? "");
  const [number, setNumber] = useState(initial?.number ?? "");
  const [movies, setMovies] = useState(initialTypes.includes("movie"));
  const [tv, setTv] = useState(initialTypes.includes("show"));
  const [genreTitle, setGenreTitle] = useState(initial?.genreTitle ?? "");
  const [unwatched, setUnwatched] = useState(initial?.unwatched ?? false);
  const [ordering, setOrdering] = useState<Ordering>(initial?.ordering ?? "SHUFFLE");

  const mediaTypes: MediaType[] = [
    ...(movies ? (["movie"] as const) : []),
    ...(tv ? (["show"] as const) : []),
  ];

  const genres = useQuery({
    ...trpc.channels.contentGenres.queryOptions({ mediaSourceId: sourceId, mediaTypes }),
    enabled: !!sourceId && mediaTypes.length > 0,
  });

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
    onSubmit({ name, number, mediaTypes, genreTitle, unwatched, ordering, mediaSourceId: sourceId });
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="cgenre">Genre (optional)</Label>
          <select
            id="cgenre"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={genreTitle}
            onChange={(e) => setGenreTitle(e.target.value)}
          >
            <option value="">Any genre</option>
            {genres.data?.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
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
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={unwatched} onChange={(e) => setUnwatched(e.target.checked)} />
        Unwatched only
      </label>
    </form>
  );
}
