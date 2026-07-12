/**
 * Sort options for a channel (mirrors Plex's library sort dropdown). When a channel
 * isn't shuffled, Plex sorts its pool by the chosen field/direction and the schedule
 * engine preserves that order. `field` is what we store; `plex` is the Plex sort key.
 */
export type SortDir = "asc" | "desc";

export type SortFieldMeta = { field: string; label: string; plex: string };

export const SORT_FIELDS: SortFieldMeta[] = [
  { field: "title", label: "Title", plex: "titleSort" },
  { field: "year", label: "Year", plex: "year" },
  { field: "releaseDate", label: "Release date", plex: "originallyAvailableAt" },
  { field: "criticRating", label: "Critic rating", plex: "rating" },
  { field: "audienceRating", label: "Audience rating", plex: "audienceRating" },
  { field: "userRating", label: "Personal rating", plex: "userRating" },
  { field: "contentRating", label: "Content rating", plex: "contentRating" },
  { field: "duration", label: "Duration", plex: "duration" },
  { field: "plays", label: "Plays", plex: "viewCount" },
  { field: "addedAt", label: "Date added", plex: "addedAt" },
  { field: "lastViewedAt", label: "Date viewed", plex: "lastViewedAt" },
  { field: "resolution", label: "Resolution", plex: "mediaHeight" },
  { field: "bitrate", label: "Bitrate", plex: "mediaBitrate" },
];

const PLEX_BY_FIELD = new Map(SORT_FIELDS.map((s) => [s.field, s.plex]));

/** Build the Plex `sort=` value for a channel's ordering. Shuffle uses a stable sort. */
export function channelSortParam(ordering: string, sortField: string, sortDir: string): string {
  if (ordering === "SHUFFLE") return "titleSort"; // stable subset under the query cap; engine shuffles
  if (ordering === "BY_AIR_DATE") return "originallyAvailableAt:desc"; // legacy
  const plex = PLEX_BY_FIELD.get(sortField) ?? "titleSort";
  return `${plex}:${sortDir === "desc" ? "desc" : "asc"}`;
}
