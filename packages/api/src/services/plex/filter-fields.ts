/**
 * Channel filter model — a recursive predicate tree (Plex-parity). Groups combine
 * children with AND/OR; conditions are `{ field, op, value }`. The resolver turns
 * this into Plex filter queries and combines results in code (intersect for AND,
 * union for OR), so arbitrary nesting works with only Plex's simple operators.
 *
 * Field catalog mirrors Plex's advanced-filter fields. For TV, each field resolves
 * at its Plex level via the dotted syntax (`show.genre`, `episode.resolution`) —
 * see `tvScope`. Movies are self-contained and unprefixed.
 */

export type FilterOp =
  | "is"
  | "isNot"
  | "gte"
  | "lte"
  | "contains"
  | "notContains"
  | "equals"
  | "notEquals"
  | "beginsWith"
  | "endsWith";

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

export type FieldKind = "tag" | "int" | "bool" | "string" | "text" | "date" | "recency";

export type FieldMeta = {
  field: string;
  label: string;
  kind: FieldKind;
  plex: string; // Plex query param name
  tagId?: boolean; // value is a tag/value title that resolves to a key per library
  durationMinutes?: boolean; // value entered in minutes; sent as ms
  /** TV level for the dotted syntax (`show.genre` / `episode.resolution`). Default "show". */
  tvScope?: "show" | "episode";
  /** Library types this field applies to. Omitted = both. */
  appliesTo?: ("movie" | "show")[];
};

export const FILTER_FIELDS: FieldMeta[] = [
  // Text
  { field: "title", label: "Title / Show title", kind: "text", plex: "title" },
  {
    field: "episodeTitle",
    label: "Episode title",
    kind: "text",
    plex: "title",
    tvScope: "episode",
    appliesTo: ["show"],
  },
  // Tags (value-list dropdowns)
  { field: "genre", label: "Genre", kind: "tag", plex: "genre", tagId: true },
  { field: "label", label: "Label", kind: "tag", plex: "label", tagId: true },
  { field: "collection", label: "Collection", kind: "tag", plex: "collection", tagId: true },
  { field: "studio", label: "Studio", kind: "tag", plex: "studio", tagId: true },
  { field: "network", label: "Network", kind: "tag", plex: "network", tagId: true, appliesTo: ["show"] },
  { field: "director", label: "Director", kind: "tag", plex: "director", tagId: true },
  { field: "writer", label: "Writer", kind: "tag", plex: "writer", tagId: true },
  { field: "producer", label: "Producer", kind: "tag", plex: "producer", tagId: true },
  { field: "actor", label: "Actor", kind: "tag", plex: "actor", tagId: true },
  { field: "country", label: "Country", kind: "tag", plex: "country", tagId: true },
  { field: "contentRating", label: "Content rating", kind: "tag", plex: "contentRating", tagId: true },
  { field: "resolution", label: "Resolution", kind: "tag", plex: "resolution", tagId: true, tvScope: "episode" },
  {
    field: "audioLanguage",
    label: "Audio language",
    kind: "tag",
    plex: "audioLanguage",
    tagId: true,
    tvScope: "episode",
  },
  {
    field: "subtitleLanguage",
    label: "Subtitle language",
    kind: "tag",
    plex: "subtitleLanguage",
    tagId: true,
    tvScope: "episode",
  },
  // Numeric
  { field: "year", label: "Year", kind: "int", plex: "year" },
  { field: "decade", label: "Decade", kind: "int", plex: "decade" },
  { field: "audienceRating", label: "Audience rating (0–10)", kind: "int", plex: "audienceRating" },
  { field: "criticRating", label: "Critic rating (0–10)", kind: "int", plex: "rating" },
  {
    field: "duration",
    label: "Duration (min)",
    kind: "int",
    plex: "duration",
    durationMinutes: true,
    tvScope: "episode",
    appliesTo: ["movie"],
  },
  // Dates (episode-level for TV — recently-aired / recently-added episodes)
  {
    field: "releaseDate",
    label: "Release / air date",
    kind: "date",
    plex: "originallyAvailableAt",
    tvScope: "episode",
  },
  { field: "addedWithin", label: "Added within (days)", kind: "recency", plex: "addedAt", tvScope: "episode" },
  // Booleans
  { field: "unwatched", label: "Unwatched", kind: "bool", plex: "unwatched", tvScope: "episode" },
  { field: "inProgress", label: "In progress", kind: "bool", plex: "inProgress", tvScope: "episode" },
  { field: "hdr", label: "HDR", kind: "bool", plex: "hdr", tvScope: "episode" },
  { field: "dovi", label: "Dolby Vision", kind: "bool", plex: "dovi", tvScope: "episode" },
  // Personal / playback state
  { field: "userRating", label: "Personal rating (0–10)", kind: "int", plex: "userRating" },
  { field: "viewCount", label: "Play count", kind: "int", plex: "viewCount" },
  { field: "lastViewedAt", label: "Last watched (date)", kind: "date", plex: "lastViewedAt" },
  {
    field: "unwatchedLeaves",
    label: "Has unwatched episodes",
    kind: "bool",
    plex: "unwatchedLeaves",
    appliesTo: ["show"],
  },
  {
    field: "episodeYear",
    label: "Episode year",
    kind: "int",
    plex: "year",
    tvScope: "episode",
    appliesTo: ["show"],
  },
  { field: "contentRatingAge", label: "Common Sense age", kind: "int", plex: "contentRatingAge" },
  { field: "editionTitle", label: "Edition", kind: "tag", plex: "editionTitle", tagId: true },
  { field: "location", label: "Folder location", kind: "tag", plex: "location", tagId: true, tvScope: "episode" },
  // Library maintenance
  { field: "unmatched", label: "Unmatched", kind: "bool", plex: "unmatched" },
  { field: "duplicate", label: "Duplicate", kind: "bool", plex: "duplicate", tvScope: "episode" },
  { field: "trash", label: "In trash", kind: "bool", plex: "trash", tvScope: "episode" },
];

export const OPS_FOR_KIND: Record<FieldKind, FilterOp[]> = {
  tag: ["is", "isNot"],
  // Plex string ops (from the OpenAPI "Media Queries" spec — the =-count IS the operator): `=` contains,
  // `==` equals, `<=` begins-with, `>=` ends-with, plus the `!` negations. So a text field supports BOTH
  // fuzzy (contains) AND exact (equals) matching. `contains` stays first = the default op, so existing
  // channels keep their current substring behavior; the exact-match ops are new, additive capability.
  string: ["equals", "notEquals", "contains", "notContains", "beginsWith", "endsWith"],
  text: ["contains", "notContains", "equals", "notEquals", "beginsWith", "endsWith"],
  int: ["is", "gte", "lte"],
  date: ["gte", "lte"],
  recency: ["is"],
  bool: ["is"],
};

const OP_SUFFIX: Record<FilterOp, string> = {
  is: "=", // tag "is" / int equals (Plex tag `=` = is)
  isNot: "!=",
  gte: ">=",
  lte: "<=",
  contains: "=", // Plex string `=value` is a substring/contains match
  notContains: "!=", // string `!=value` does not contain
  equals: "==", // string `==value` is EXACT equals ("is"); a single `=` is contains
  notEquals: "!==", // string `!==value` is exact "is not"
  beginsWith: "<=", // string `<=value` begins-with (same chars as int lte; text kind never uses lte)
  endsWith: ">=", // string `>=value` ends-with
};

export function fieldMeta(field: string): FieldMeta | undefined {
  return FILTER_FIELDS.find((f) => f.field === field);
}

/**
 * Build a single Plex filter param for a condition, resolving tag titles → keys for
 * the current library and applying the TV dotted prefix. Returns null when the tag
 * value doesn't exist here, or the field doesn't apply to this library type.
 */
export async function buildParam(
  cond: FilterCondition,
  resolveTag: (plexField: string, title: string) => Promise<string | undefined>,
  opts: { libType?: "movie" | "show" } = {},
): Promise<string | null> {
  const meta = fieldMeta(cond.field);
  if (!meta) return null;
  const libType = opts.libType ?? "movie";
  if (meta.appliesTo && !meta.appliesTo.includes(libType)) return null;

  const tv = libType === "show";
  const name = tv ? `${meta.tvScope ?? "show"}.${meta.plex}` : meta.plex;
  const suffix = OP_SUFFIX[cond.op];

  if (meta.kind === "recency") {
    const days = Math.max(0, Math.round(Number(cond.value) || 0));
    return `${name}>=-${days}d`; // Plex relative-date syntax
  }
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
