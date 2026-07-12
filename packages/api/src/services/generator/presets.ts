import type { FilterCondition, FilterGroupNode, FilterNode, FilterOp } from "../plex/filter-fields";

export type MediaType = "movie" | "show";

export type PresetChannel = {
  /** Stable presetKey — stored on the generated channel for provenance. */
  key: string;
  name: string;
  description: string;
  number: number;
  icon?: string;
  /** If omitted, the channel inherits the package tint. */
  tint?: string;
  mediaTypes: MediaType[];
  ordering: "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";
  /** Undefined = the whole library (of the chosen media types). */
  filter?: FilterNode;
  /** Skip this channel if the library has fewer than this many matching items. */
  minItems: number;
};

export type PresetPackage = {
  key: string;
  name: string;
  description: string;
  icon: string;
  tint: string;
  sortIndex: number;
  channels: PresetChannel[];
};

// --- filter builders -------------------------------------------------------

const c = (field: string, op: FilterOp, value: string): FilterCondition => ({
  type: "condition",
  field,
  op,
  value,
});
const and = (...children: FilterNode[]): FilterGroupNode => ({
  type: "group",
  combinator: "and",
  children,
});
const or = (...children: FilterNode[]): FilterGroupNode => ({
  type: "group",
  combinator: "or",
  children,
});
const genre = (g: string) => c("genre", "is", g);
const anyGenre = (...gs: string[]) => or(...gs.map(genre));
const rating = (v: string) => c("contentRating", "is", v);
const FAMILY_SAFE = ["G", "PG", "TV-Y", "TV-Y7", "TV-G", "TV-PG"];
const MATURE = ["R", "TV-MA", "NC-17"];
const familySafe = () => or(...FAMILY_SAFE.map(rating));
const mature = () => or(...MATURE.map(rating));
const both: MediaType[] = ["movie", "show"];

// --- catalog ---------------------------------------------------------------

export const PRESET_PACKAGES: PresetPackage[] = [
  {
    key: "basic",
    name: "Basic",
    description: "Essential broadcast channels.",
    icon: "lucide:Radio",
    tint: "sky",
    sortIndex: 1,
    channels: [
      { key: "everything", name: "The Everything Channel", number: 2, minItems: 1, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Shuffle", description: "Zero filters — your entire library, all mixed together." },
      { key: "prime-time", name: "Prime Time", number: 3, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Star", description: "Rated 7.0+ by audiences and 6.0+ by critics. The cream of the crop.", filter: and(c("audienceRating", "gte", "7"), c("criticRating", "gte", "6")) },
      { key: "fresh", name: "Fresh Off the Press", number: 4, minItems: 1, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Sparkles", description: "Added to your library in the last 30 days.", filter: c("addedWithin", "is", "30") },
      { key: "unwatched", name: "The Unwatched Pile", number: 5, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Eye", description: "Everything you haven't watched yet.", filter: c("unwatched", "is", "true") },
      { key: "family-hour", name: "Family Hour", number: 6, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Baby", description: "G / PG / TV-Y / TV-Y7 / TV-G / TV-PG only.", filter: familySafe() },
      { key: "movie-marquee", name: "Movie Marquee", number: 7, minItems: 10, mediaTypes: ["movie"], ordering: "SHUFFLE", icon: "lucide:Film", description: "Movies only, 60+ minutes.", filter: c("duration", "gte", "60") },
      { key: "series-central", name: "Series Central", number: 8, minItems: 10, mediaTypes: ["show"], ordering: "SHUFFLE", icon: "lucide:MonitorPlay", description: "Every TV series in your library." },
      { key: "uhd", name: "Ultra HD Theater", number: 12, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Tv", description: "4K content only.", filter: c("resolution", "is", "4K") },
      { key: "hd", name: "HD Showcase", number: 13, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:MonitorSmartphone", description: "1080p or higher.", filter: or(c("resolution", "is", "1080p"), c("resolution", "is", "4K")) },
      { key: "late-night", name: "Late Night", number: 17, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Moon", description: "Rated R / TV-MA / NC-17.", filter: mature() },
      { key: "shuffle", name: "The Shuffle", number: 19, minItems: 1, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Dices", description: "A completely random mix. Pure chaos." },
    ],
  },
  {
    key: "time-machine",
    name: "Time Machine",
    description: "Travel through the decades.",
    icon: "lucide:Clock",
    tint: "amber",
    sortIndex: 2,
    channels: [
      { key: "eighties", name: "Totally Eighties", number: 204, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Movies and TV from the 1980s.", filter: c("decade", "is", "1980") },
      { key: "nineties", name: "Nineties Nostalgia", number: 205, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Movies and TV from the 1990s.", filter: c("decade", "is", "1990") },
      { key: "y2k", name: "Y2K Era", number: 206, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Movies and TV from the 2000s.", filter: c("decade", "is", "2000") },
      { key: "twenty-tens", name: "Twenty-Tens", number: 207, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Movies and TV from the 2010s.", filter: c("decade", "is", "2010") },
      { key: "the-now", name: "The Now", number: 208, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Movies and TV from the 2020s.", filter: c("decade", "is", "2020") },
    ],
  },
  {
    key: "genres",
    name: "Genres",
    description: "One channel per core genre.",
    icon: "lucide:LayoutGrid",
    tint: "violet",
    sortIndex: 3,
    channels: [
      { key: "comedy", name: "The Comedy Channel", number: 40, minItems: 15, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Laugh", description: "All comedy.", filter: genre("Comedy") },
      { key: "drama", name: "Drama Central", number: 60, minItems: 15, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Drama", description: "All drama.", filter: genre("Drama") },
      { key: "action", name: "Action Zone", number: 80, minItems: 15, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Swords", description: "All action.", filter: genre("Action") },
      { key: "scifi", name: "Sci-Fi Universe", number: 82, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Rocket", description: "Science fiction.", filter: anyGenre("Science Fiction", "Sci-Fi") },
      { key: "horror", name: "Fright Night", number: 120, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Ghost", description: "Horror, mature.", filter: genre("Horror") },
      { key: "documentary", name: "Doc Central", number: 140, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:BookOpen", description: "Documentaries.", filter: genre("Documentary") },
      { key: "animation", name: "Toon Town", number: 20, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Palette", tint: "green", description: "Animation, family-safe.", filter: and(genre("Animation"), familySafe()) },
    ],
  },
];
