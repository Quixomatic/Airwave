import { Button } from "@airwave/ui/components/button";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@airwave/ui/components/select";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ListMusic, Plus, X } from "lucide-react";

import { trpc } from "@/utils/trpc";

/** One membership source: a specific Plex playlist or collection. Mirrors the router's `sources` shape. */
export type MembershipSource = { type: "playlist" | "collection"; key: string; title?: string };

/**
 * The "Playlists & collections" (MEMBERSHIP) pool builder — styled like the filter builder: a bordered box
 * of rows, each a LEFT dropdown (Playlist / Collection) + a RIGHT dropdown that lists the chosen kind
 * (playlists flat; collections grouped by library, each showing its item count and a "smart" badge). Rows
 * union into the pool. Deliberately no operators/AND-OR — membership is always a union. Reports the list
 * upward; blank rows (nothing picked yet) are kept locally and filtered out by the form on submit/preview.
 */
export function MembershipBuilder({
  value,
  onChange,
  mediaSourceId,
}: {
  value: MembershipSource[];
  onChange: (next: MembershipSource[]) => void;
  mediaSourceId: string;
}) {
  const playlists = useQuery(
    trpc.channels.playlists.queryOptions({ mediaSourceId }, { enabled: !!mediaSourceId }),
  );
  const collections = useQuery(
    trpc.channels.collections.queryOptions({ mediaSourceId }, { enabled: !!mediaSourceId }),
  );

  // Collections come back flat, tagged with their library; group them for the dropdown.
  const colsByLibrary = new Map<string, NonNullable<typeof collections.data>>();
  for (const c of collections.data ?? []) {
    const arr = colsByLibrary.get(c.library) ?? [];
    arr.push(c);
    colsByLibrary.set(c.library, arr);
  }
  const playlistByKey = new Map((playlists.data ?? []).map((p) => [p.key, p]));
  const collectionByKey = new Map((collections.data ?? []).map((c) => [c.key, c]));

  const rows = value.length ? value : [{ type: "playlist" as const, key: "", title: "" }];

  const emit = (next: MembershipSource[]) => onChange(next);
  const setRow = (i: number, s: MembershipSource) => emit(rows.map((r, k) => (k === i ? s : r)));
  const addRow = () => emit([...rows, { type: "playlist", key: "", title: "" }]);
  const removeRow = (i: number) => emit(rows.filter((_, k) => k !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    emit(next);
  };

  const empty =
    !playlists.isLoading &&
    !collections.isLoading &&
    (playlists.data?.length ?? 0) === 0 &&
    (collections.data?.length ?? 0) === 0;

  if (empty) {
    return (
      <p className="text-muted-foreground text-sm">
        This source has no playlists or collections. Create them in Plex, then they'll appear here.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="space-y-2">
        {rows.map((row, i) => {
          const itemLabel =
            row.type === "playlist"
              ? (playlistByKey.get(row.key)?.title ?? row.title)
              : (collectionByKey.get(row.key)?.title ?? row.title);
          return (
            <div key={i} className="flex items-center gap-2">
              {/* Reorder — the row order is the IN_ORDER play order. */}
              <div className="flex flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-4"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-4"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* LEFT: which kind of source. Switching kind clears the picked item. */}
              <Select
                value={row.type}
                onValueChange={(v) =>
                  setRow(i, { type: (v ?? "playlist") as "playlist" | "collection", key: "", title: "" })
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue>{(v) => (v === "collection" ? "Collection" : "Playlist")}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="playlist">Playlist</SelectItem>
                  <SelectItem value="collection">Collection</SelectItem>
                </SelectPopup>
              </Select>

              {/* RIGHT: the specific playlist/collection, list depends on the left dropdown. */}
              <Select
                value={row.key}
                onValueChange={(v) =>
                  setRow(i, {
                    type: row.type,
                    key: v ?? "",
                    title:
                      row.type === "playlist"
                        ? playlistByKey.get(v ?? "")?.title
                        : collectionByKey.get(v ?? "")?.title,
                  })
                }
              >
                <SelectTrigger className="min-w-0 flex-1">
                  <SelectValue>
                    {(v) =>
                      v
                        ? (itemLabel ?? "…")
                        : row.type === "playlist"
                          ? "Select a playlist…"
                          : "Select a collection…"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {row.type === "playlist"
                    ? playlists.data?.map((p) => (
                        <SelectItem key={p.key} value={p.key}>
                          {p.title}
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            {p.itemCount} items{p.smart ? " · smart" : ""}
                          </span>
                        </SelectItem>
                      ))
                    : [...colsByLibrary.entries()].map(([library, cols]) => (
                        <SelectGroup key={library}>
                          <SelectGroupLabel>{library}</SelectGroupLabel>
                          {cols.map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                              {c.title}
                              <span className="text-muted-foreground ml-1.5 text-xs">
                                {c.childCount} items{c.smart ? " · smart" : ""}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                </SelectPopup>
              </Select>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => removeRow(i)}
                aria-label="Remove source"
                disabled={rows.length === 1 && !row.key}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Playlist or collection
      </Button>

      <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs">
        <ListMusic className="h-3.5 w-3.5 shrink-0" />
        The channel plays everything in these, combined. Show and season entries expand to their episodes.
      </p>
    </div>
  );
}
