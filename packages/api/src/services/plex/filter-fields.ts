/**
 * Channel filter model — a recursive predicate tree (Plex-parity). Groups combine
 * children with AND/OR; conditions are `{ field, op, value }`. The resolver turns
 * this into Plex filter queries and combines results in code (intersect for AND,
 * union for OR), so arbitrary nesting works with only Plex's simple operators.
 */

export type FilterOp = "is" | "isNot" | "gte" | "lte" | "contains" | "notContains";

export type FilterCondition = {
  type: "condition";
  id?: string;
  field: string;
  op: FilterOp;
  value: string;
};

export type FilterGroupNode = {
  type: "group";
  id?: string;
  combinator: "and" | "or";
  children: FilterNode[];
};

export type FilterNode = FilterCondition | FilterGroupNode;

export type FieldKind = "tag" | "int" | "bool" | "string" | "text";

export type FieldMeta = {
  field: string;
  label: string;
  kind: FieldKind;
  plex: string; // Plex query param name
  tagId?: boolean; // value is a tag title that must resolve to an id per library
  durationMinutes?: boolean; // value entered in minutes; sent as ms
  /**
   * For a TV (episode) query, Plex's advanced filters prefix the field with the
   * level it lives at — `show.genre`, `episode.resolution`. Most fields are
   * show-level; a few (resolution, duration, unwatched) are per-episode. Movies
   * are self-contained and use no prefix. Defaults to "show".
   */
  tvScope?: "show" | "episode";
};

export const FILTER_FIELDS: FieldMeta[] = [
  { field: "title", label: "Title", kind: "text", plex: "title" },
  { field: "genre", label: "Genre", kind: "tag", plex: "genre", tagId: true },
  { field: "label", label: "Label", kind: "tag", plex: "label", tagId: true },
  { field: "collection", label: "Collection", kind: "tag", plex: "collection", tagId: true },
  { field: "studio", label: "Studio", kind: "tag", plex: "studio", tagId: true },
  { field: "director", label: "Director", kind: "tag", plex: "director", tagId: true },
  { field: "actor", label: "Actor", kind: "tag", plex: "actor", tagId: true },
  { field: "country", label: "Country", kind: "tag", plex: "country", tagId: true },
  { field: "contentRating", label: "Content rating", kind: "tag", plex: "contentRating", tagId: true },
  { field: "resolution", label: "Resolution", kind: "tag", plex: "resolution", tagId: true, tvScope: "episode" },
  { field: "year", label: "Year", kind: "int", plex: "year" },
  { field: "decade", label: "Decade", kind: "int", plex: "decade" },
  { field: "audienceRating", label: "Audience rating", kind: "int", plex: "audienceRating" },
  { field: "criticRating", label: "Critic rating", kind: "int", plex: "rating" },
  {
    field: "duration",
    label: "Duration (min)",
    kind: "int",
    plex: "duration",
    durationMinutes: true,
    tvScope: "episode",
  },
  { field: "unwatched", label: "Unwatched", kind: "bool", plex: "unwatched", tvScope: "episode" },
];

export const OPS_FOR_KIND: Record<FieldKind, FilterOp[]> = {
  tag: ["is", "isNot"],
  string: ["is", "isNot"],
  text: ["contains", "notContains"],
  int: ["is", "gte", "lte"],
  bool: ["is"],
};

const OP_SUFFIX: Record<FilterOp, string> = {
  is: "=",
  isNot: "!=",
  gte: ">=",
  lte: "<=",
  contains: "=", // Plex `title=value` is a substring/contains match
  notContains: "!=",
};

export function fieldMeta(field: string): FieldMeta | undefined {
  return FILTER_FIELDS.find((f) => f.field === field);
}

/**
 * Build a single Plex filter param for a condition, resolving tag titles → ids
 * for the current library. Returns null when a tag value doesn't exist here.
 */
export async function buildParam(
  cond: FilterCondition,
  resolveTag: (plexField: string, title: string) => Promise<string | undefined>,
  opts: { tv?: boolean } = {},
): Promise<string | null> {
  const meta = fieldMeta(cond.field);
  if (!meta) return null;
  const suffix = OP_SUFFIX[cond.op];
  // TV episode queries prefix each field with its level (show.genre / episode.resolution).
  const name = opts.tv ? `${meta.tvScope ?? "show"}.${meta.plex}` : meta.plex;

  if (meta.kind === "bool") {
    return `${name}=${cond.value === "false" ? "0" : "1"}`;
  }
  if (meta.tagId) {
    const id = await resolveTag(meta.plex, cond.value);
    if (!id) return null;
    return `${name}${suffix}${id}`;
  }
  if (meta.durationMinutes) {
    const ms = Math.round((Number(cond.value) || 0) * 60000);
    return `${name}${suffix}${ms}`;
  }
  return `${name}${suffix}${encodeURIComponent(cond.value)}`;
}
