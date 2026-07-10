/**
 * Channel filter model — a recursive predicate tree (Plex-parity). Groups combine
 * children with AND/OR; conditions are `{ field, op, value }`. The resolver turns
 * this into Plex filter queries and combines results in code (intersect for AND,
 * union for OR), so arbitrary nesting works with only Plex's simple operators.
 */

export type FilterOp = "is" | "isNot" | "gte" | "lte";

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

export type FieldKind = "tag" | "int" | "bool" | "string";

export type FieldMeta = {
  field: string;
  label: string;
  kind: FieldKind;
  plex: string; // Plex query param name
  tagId?: boolean; // value is a tag title that must resolve to an id per library
  durationMinutes?: boolean; // value entered in minutes; sent as ms
};

export const FILTER_FIELDS: FieldMeta[] = [
  { field: "genre", label: "Genre", kind: "tag", plex: "genre", tagId: true },
  { field: "collection", label: "Collection", kind: "tag", plex: "collection", tagId: true },
  { field: "studio", label: "Studio", kind: "tag", plex: "studio", tagId: true },
  { field: "director", label: "Director", kind: "tag", plex: "director", tagId: true },
  { field: "actor", label: "Actor", kind: "tag", plex: "actor", tagId: true },
  { field: "country", label: "Country", kind: "tag", plex: "country", tagId: true },
  { field: "contentRating", label: "Content rating", kind: "string", plex: "contentRating" },
  { field: "resolution", label: "Resolution", kind: "string", plex: "resolution" },
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
  },
  { field: "unwatched", label: "Unwatched", kind: "bool", plex: "unwatched" },
];

export const OPS_FOR_KIND: Record<FieldKind, FilterOp[]> = {
  tag: ["is", "isNot"],
  string: ["is", "isNot"],
  int: ["is", "gte", "lte"],
  bool: ["is"],
};

const OP_SUFFIX: Record<FilterOp, string> = { is: "=", isNot: "!=", gte: ">=", lte: "<=" };

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
): Promise<string | null> {
  const meta = fieldMeta(cond.field);
  if (!meta) return null;
  const suffix = OP_SUFFIX[cond.op];

  if (meta.kind === "bool") {
    return `${meta.plex}=${cond.value === "false" ? "0" : "1"}`;
  }
  if (meta.tagId) {
    const id = await resolveTag(meta.plex, cond.value);
    if (!id) return null;
    return `${meta.plex}${suffix}${id}`;
  }
  if (meta.durationMinutes) {
    const ms = Math.round((Number(cond.value) || 0) * 60000);
    return `${meta.plex}${suffix}${ms}`;
  }
  return `${meta.plex}${suffix}${encodeURIComponent(cond.value)}`;
}
