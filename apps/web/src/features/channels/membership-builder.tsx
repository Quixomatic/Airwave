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

/** Encode/decode a source as a single Select value (`type:key`). */
const toValue = (s: MembershipSource): string => (s.key ? `${s.type}:${s.key}` : "");
function fromValue(v: string): { type: "playlist" | "collection"; key: string } | null {
  const i = v.indexOf(":");
  if (i < 0) return null;
  const type = v.slice(0, i);
  const key = v.slice(i + 1);
  return type === "playlist" || type === "collection" ? { type, key } : null;
}

/**
 * The "Playlists & collections" (MEMBERSHIP) pool builder: an ordered OR-list of Plex playlists/collections.
 * Each row picks one source from a grouped dropdown (Playlists, then Collections by library, each showing its
 * item count and a "smart" badge). Rows union into the pool; their order drives IN_ORDER, so rows can be moved
 * up/down. Deliberately no operators/AND-OR — membership is always a union. Reports the ordered list upward;
 * blank rows (nothing picked yet) are kept locally and filtered out by the form on submit/preview.
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

  // value → display label, so a selected row shows its title (+ item count) even before the lists finish loading.
  const labelByValue = new Map<string, string>();
  for (const p of playlists.data ?? []) labelByValue.set(`playlist:${p.key}`, `${p.title} · ${p.itemCount} items`);
  for (const c of collections.data ?? [])
    labelByValue.set(`collection:${c.key}`, `${c.title} · ${c.library} · ${c.childCount} items`);

  const rows = value.length ? value : [{ type: "playlist" as const, key: "", title: "" }];

  const emit = (next: MembershipSource[]) => onChange(next);
  const setRow = (i: number, s: MembershipSource) => emit(rows.map((r, k) => (k === i ? s : r)));
  const addRow = () => emit([...rows, { type: "playlist", key: "", title: "" }]);
  const removeRow = (i: number) => {
    const next = rows.filter((_, k) => k !== i);
    emit(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    emit(next);
  };

  const pick = (i: number, v: string) => {
    const parsed = fromValue(v);
    if (!parsed) return setRow(i, { type: "playlist", key: "", title: "" });
    setRow(i, { ...parsed, title: labelByValue.get(v)?.split(" · ")[0] });
  };

  const loading = playlists.isLoading || collections.isLoading;
  const empty = !loading && (playlists.data?.length ?? 0) === 0 && (collections.data?.length ?? 0) === 0;

  return (
    <div className="space-y-2">
      {empty ? (
        <p className="text-muted-foreground text-sm">
          This source has no playlists or collections. Create them in Plex, then they'll appear here.
        </p>
      ) : (
        <>
          {rows.map((row, i) => {
            const v = toValue(row);
            return (
              <div key={i} className="flex items-center gap-2">
                {/* Move up/down to reorder — the order is the IN_ORDER play order. */}
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

                <Select value={v} onValueChange={(nv) => pick(i, nv ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(sel) => (sel ? (labelByValue.get(sel as string) ?? row.title ?? "…") : "Select a playlist or collection…")}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {(playlists.data?.length ?? 0) > 0 && (
                      <SelectGroup>
                        <SelectGroupLabel>Playlists</SelectGroupLabel>
                        {playlists.data?.map((p) => (
                          <SelectItem key={`playlist:${p.key}`} value={`playlist:${p.key}`}>
                            {p.title}
                            <span className="text-muted-foreground ml-1.5 text-xs">
                              {p.itemCount} items{p.smart ? " · smart" : ""}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {[...colsByLibrary.entries()].map(([library, cols]) => (
                      <SelectGroup key={library}>
                        <SelectGroupLabel>Collections · {library}</SelectGroupLabel>
                        {cols.map((c) => (
                          <SelectItem key={`collection:${c.key}`} value={`collection:${c.key}`}>
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
                  <X className="h-4 w-4" />
                </Button>
              </div>
            );
          })}

          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add playlist or collection
          </Button>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ListMusic className="h-3.5 w-3.5" />
            The channel plays everything in these, combined. Show and season entries expand to their episodes.
          </p>
        </>
      )}
    </div>
  );
}
