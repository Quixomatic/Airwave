import type { FilterCondition, FilterGroupNode, FilterNode, FilterOp } from "../plex/filter-fields";

export type MediaType = "movie" | "show";

export type PresetChannel = {
  /** Stable presetKey — stored on the generated channel for provenance. */
  key: string;
  name: string;
  /** BunnyEars-style callsign (uppercase, ≤6). */
  callsign: string;
  description: string;
  number: number;
  icon?: string;
  /** If omitted, the channel inherits the package tint. */
  tint?: string;
  mediaTypes: MediaType[];
  ordering: "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE";
  sortField?: string;
  sortDir?: "asc" | "desc";
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

const cond = (field: string, op: FilterOp, value: string): FilterCondition => ({
  type: "condition",
  field,
  op,
  value,
});
const and = (...children: FilterNode[]): FilterGroupNode => ({ type: "group", combinator: "and", children });
const or = (...children: FilterNode[]): FilterGroupNode => ({ type: "group", combinator: "or", children });

const genre = (g: string) => cond("genre", "is", g);
const anyGenre = (...gs: string[]) => or(...gs.map(genre));
const rating = (v: string) => cond("contentRating", "is", v);
const director = (n: string) => cond("director", "is", n);
const actor = (n: string) => cond("actor", "is", n);
const studio = (s: string) => cond("studio", "is", s);
const anyStudio = (...ss: string[]) => or(...ss.map(studio));
const country = (n: string) => cond("country", "is", n);
const anyCountry = (...cs: string[]) => or(...cs.map(country));
const decade = (d: string) => cond("decade", "is", d);
const aud = (v: string) => cond("audienceRating", "gte", v);
const crit = (v: string) => cond("criticRating", "gte", v);
const durGte = (min: string) => cond("duration", "gte", min);
const durLte = (max: string) => cond("duration", "lte", max);
const res = (v: string) => cond("resolution", "is", v);
const addedWithin = (days: string) => cond("addedWithin", "is", days);
const unwatched = () => cond("unwatched", "is", "true");

const FAMILY_SAFE = ["G", "PG", "TV-Y", "TV-Y7", "TV-G", "TV-PG"];
const MATURE = ["R", "TV-MA", "NC-17"];
const familySafe = () => or(...FAMILY_SAFE.map(rating));
const mature = () => or(...MATURE.map(rating));

const both: MediaType[] = ["movie", "show"];
const movie: MediaType[] = ["movie"];
const tv: MediaType[] = ["show"];

const directorChannel = (
  key: string,
  number: number,
  name: string,
  callsign: string,
  who: string,
  animated = false,
): PresetChannel => ({
  key,
  name,
  callsign,
  number,
  minItems: 3,
  mediaTypes: movie,
  ordering: "SHUFFLE",
  description: `Films directed by ${who}.`,
  filter: animated ? and(director(who), genre("Animation")) : and(director(who), durGte("60")),
});

const actorChannel = (
  key: string,
  number: number,
  name: string,
  callsign: string,
  who: string,
  floor?: string,
): PresetChannel => ({
  key,
  name,
  callsign,
  number,
  minItems: 3,
  mediaTypes: both,
  ordering: "SHUFFLE",
  description: `Featuring ${who}.`,
  filter: floor ? and(actor(who), aud(floor)) : actor(who),
});

const studioChannel = (
  key: string,
  number: number,
  name: string,
  callsign: string,
  studios: string[],
  floor?: string,
): PresetChannel => ({
  key,
  name,
  callsign,
  number,
  minItems: 5,
  mediaTypes: both,
  ordering: "SHUFFLE",
  description: `Everything from ${name}.`,
  filter: floor
    ? and(anyStudio(...studios), aud(floor))
    : studios.length > 1
      ? anyStudio(...studios)
      : studio(studios[0]!),
});

const countryChannel = (
  key: string,
  number: number,
  name: string,
  callsign: string,
  countries: string[],
  floor = "5",
): PresetChannel => ({
  key,
  name,
  callsign,
  number,
  minItems: 5,
  mediaTypes: both,
  ordering: "SHUFFLE",
  description: `Content from ${name}.`,
  filter: and(anyCountry(...countries), aud(floor)),
});

const decadeChannel = (
  key: string,
  number: number,
  name: string,
  callsign: string,
  d: string,
  types: MediaType[] = both,
  extra?: FilterNode,
): PresetChannel => ({
  key,
  name,
  callsign,
  number,
  minItems: 10,
  mediaTypes: types,
  ordering: "SHUFFLE",
  description: `${types.length === 1 ? (types[0] === "movie" ? "Movies" : "TV") : "Movies and TV"} from the ${name}.`,
  filter: extra ? and(decade(d), extra) : decade(d),
});

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
      { key: "everything", name: "The Everything Channel", callsign: "EVRTV", number: 2, minItems: 1, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Shuffle", description: "Zero filters — your entire library, all mixed together." },
      { key: "prime-time", name: "Prime Time", callsign: "PRIME", number: 3, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Star", description: "Rated 7.0+ by audiences and 6.0+ by critics.", filter: and(aud("7"), crit("6")) },
      { key: "fresh", name: "Fresh Off the Press", callsign: "FRESH", number: 4, minItems: 1, mediaTypes: both, ordering: "IN_ORDER", sortField: "addedAt", sortDir: "desc", icon: "lucide:Sparkles", description: "Added to your library in the last 30 days.", filter: addedWithin("30") },
      { key: "unwatched", name: "The Unwatched Pile", callsign: "UNWCH", number: 5, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Eye", description: "Everything you haven't watched yet.", filter: unwatched() },
      { key: "family-hour", name: "Family Hour", callsign: "FAMHR", number: 6, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Baby", description: "G / PG / TV-Y / TV-Y7 / TV-G / TV-PG only.", filter: familySafe() },
      { key: "movie-marquee", name: "Movie Marquee", callsign: "MOVMQ", number: 7, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", icon: "lucide:Film", description: "Movies only, 60+ minutes.", filter: durGte("60") },
      { key: "series-central", name: "Series Central", callsign: "SRSCT", number: 8, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", icon: "lucide:MonitorPlay", description: "Every TV series in your library." },
      { key: "quick-bites", name: "Quick Bites", callsign: "QKBTS", number: 9, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Timer", description: "Under 45 minutes.", filter: durLte("45") },
      { key: "popcorn", name: "Popcorn Classics", callsign: "PPCLS", number: 10, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", icon: "lucide:Popcorn", description: "Movies 7.5+ audience, 6.0+ critic, 75+ min.", filter: and(aud("7.5"), crit("6"), durGte("75")) },
      { key: "uhd", name: "Ultra HD Theater", callsign: "UHD4K", number: 12, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Tv", description: "4K content only.", filter: res("4K") },
      { key: "hd", name: "HD Showcase", callsign: "HDSHW", number: 13, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:MonitorSmartphone", description: "1080p or higher.", filter: or(res("1080p"), res("4K")) },
      { key: "critics-choice", name: "Critics' Choice", callsign: "CRITC", number: 14, minItems: 5, mediaTypes: both, ordering: "IN_ORDER", sortField: "criticRating", sortDir: "desc", icon: "lucide:Award", description: "8.0+ audience, 7.5+ critic.", filter: and(aud("8"), crit("7.5")) },
      { key: "back-catalog", name: "The Back Catalog", callsign: "BKCAT", number: 15, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Archive", description: "1950s–2000s.", filter: or(decade("1950"), decade("1960"), decade("1970"), decade("1980"), decade("1990"), decade("2000")) },
      { key: "new-millennium", name: "New Millennium", callsign: "NWMLN", number: 16, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:CalendarClock", description: "2000s onward.", filter: or(decade("2000"), decade("2010"), decade("2020")) },
      { key: "late-night", name: "Late Night", callsign: "LTNIT", number: 17, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Moon", description: "Rated R / TV-MA / NC-17.", filter: mature() },
      { key: "double-feature", name: "Double Feature", callsign: "DBLFT", number: 18, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", icon: "lucide:Clapperboard", description: "Movies 2h+, rated 6.5+.", filter: and(durGte("120"), aud("6.5")) },
      { key: "shuffle", name: "The Shuffle", callsign: "SHFFL", number: 19, minItems: 1, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Dices", description: "A completely random mix." },
    ],
  },
  {
    key: "kids-family",
    name: "Kids & Family",
    description: "Family-friendly fun for all ages.",
    icon: "lucide:Baby",
    tint: "green",
    sortIndex: 2,
    channels: [
      { key: "toon-town", name: "Toon Town", callsign: "TOONS", number: 20, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Palette", description: "Animation, family-safe.", filter: and(genre("Animation"), familySafe()) },
      { key: "family-movie-night", name: "Family Movie Night", callsign: "FMMOV", number: 21, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Family movies, 60+ min, G–PG.", filter: and(anyGenre("Family", "Comedy", "Adventure", "Animation"), durGte("60"), or(rating("G"), rating("PG"))) },
      { key: "saturday-morning", name: "Saturday Morning", callsign: "SATAM", number: 22, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "Animated kids TV.", filter: and(genre("Animation"), familySafe()) },
      { key: "laugh-track-jr", name: "Laugh Track Jr", callsign: "LTJR", number: 24, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Kids comedy.", filter: and(genre("Comedy"), anyGenre("Family", "Animation"), familySafe()) },
      { key: "bedtime-stories", name: "Bedtime Stories", callsign: "BEDTM", number: 27, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Gentle animation under 90 min.", filter: and(genre("Animation"), durLte("90"), familySafe()) },
      { key: "musical-kids", name: "Musical Kids", callsign: "MUSKD", number: 29, minItems: 3, mediaTypes: both, ordering: "SHUFFLE", description: "Kids musicals.", filter: and(genre("Musical"), anyGenre("Family", "Animation"), familySafe()) },
      { key: "anime-adventures", name: "Anime Adventures", callsign: "ANMAD", number: 30, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Family-friendly anime.", filter: and(anyGenre("Anime", "Animation"), or(rating("G"), rating("PG"), rating("TV-Y"), rating("TV-Y7"), rating("TV-G"), rating("TV-PG"), rating("TV-14"))) },
      { key: "tween-scene", name: "Tween Scene", callsign: "TWEEN", number: 32, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Family + comedy/drama, PG–TV-14.", filter: and(genre("Family"), anyGenre("Comedy", "Drama")) },
      { key: "cartoon-classics", name: "Cartoon Classics", callsign: "CLSCR", number: 33, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Animation, 1950s–1990s.", filter: and(genre("Animation"), or(decade("1950"), decade("1960"), decade("1970"), decade("1980"), decade("1990"))) },
      { key: "storytime", name: "Storytime Theater", callsign: "STORY", number: 34, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Family films, 60+ min.", filter: and(anyGenre("Family", "Fantasy", "Adventure"), durGte("60"), familySafe()) },
    ],
  },
  {
    key: "comedy",
    name: "Comedy & Fun",
    description: "Laughs and good vibes.",
    icon: "lucide:Laugh",
    tint: "yellow",
    sortIndex: 3,
    channels: [
      { key: "comedy-channel", name: "The Comedy Channel", callsign: "COMDY", number: 40, minItems: 15, mediaTypes: both, ordering: "SHUFFLE", description: "All comedy, 5.0+.", filter: and(genre("Comedy"), aud("5")) },
      { key: "sitcom-city", name: "Sitcom City", callsign: "SITCM", number: 41, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "TV comedy.", filter: genre("Comedy") },
      { key: "comedy-cinema", name: "Comedy Cinema", callsign: "CMDCN", number: 42, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Comedy movies, 60+ min.", filter: and(genre("Comedy"), durGte("60")) },
      { key: "dark-laughs", name: "Dark Laughs", callsign: "DRKLF", number: 43, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Dark comedy, mature, 5.5+.", filter: and(genre("Comedy"), mature(), aud("5.5")) },
      { key: "rom-com", name: "Rom-Com Radio", callsign: "ROMCM", number: 46, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Romance + comedy, 5.0+.", filter: and(genre("Romance"), genre("Comedy"), aud("5")) },
      { key: "animated-laughs", name: "Animated Laughs", callsign: "ANLFS", number: 47, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Adult animated comedy.", filter: and(genre("Comedy"), genre("Animation"), mature()) },
      { key: "family-comedy", name: "Family Comedy", callsign: "FAMCM", number: 49, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Comedy + family, G–TV-14.", filter: and(genre("Comedy"), genre("Family")) },
      { key: "comedy-gold", name: "Comedy Gold", callsign: "CMDGD", number: 50, minItems: 10, mediaTypes: both, ordering: "IN_ORDER", sortField: "audienceRating", sortDir: "desc", description: "Comedy 7.5+ audience, 6.5+ critic.", filter: and(genre("Comedy"), aud("7.5"), crit("6.5")) },
      { key: "late-night-laughs", name: "Late Night Laughs", callsign: "LTNLF", number: 52, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Mature comedy, 5.0+.", filter: and(genre("Comedy"), mature(), aud("5")) },
      { key: "comedy-classics", name: "Comedy Classics", callsign: "CLSCM", number: 56, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Comedy, 1950s–1980s.", filter: and(genre("Comedy"), or(decade("1950"), decade("1960"), decade("1970"), decade("1980"))) },
    ],
  },
  {
    key: "drama",
    name: "Drama & Romance",
    description: "Stories that move you.",
    icon: "lucide:Drama",
    tint: "rose",
    sortIndex: 4,
    channels: [
      { key: "drama-central", name: "Drama Central", callsign: "DRCTV", number: 60, minItems: 15, mediaTypes: both, ordering: "SHUFFLE", description: "All drama, 5.5+.", filter: and(genre("Drama"), aud("5.5")) },
      { key: "movie-dramas", name: "Movie Dramas", callsign: "DRMAM", number: 61, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Drama movies, 75+ min, 5.5+.", filter: and(genre("Drama"), durGte("75"), aud("5.5")) },
      { key: "drama-series", name: "Drama Series", callsign: "DRMAS", number: 62, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "TV drama, 5.5+.", filter: and(genre("Drama"), aud("5.5")) },
      { key: "love-stories", name: "Love Stories", callsign: "LOVSN", number: 63, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Romance, 5.0+.", filter: and(genre("Romance"), aud("5")) },
      { key: "prestige-tv", name: "Prestige TV", callsign: "PRSTG", number: 69, minItems: 5, mediaTypes: tv, ordering: "IN_ORDER", sortField: "audienceRating", sortDir: "desc", description: "TV drama 8.0+ audience, 7.0+ critic.", filter: and(genre("Drama"), aud("8"), crit("7")) },
      { key: "war-honor", name: "War & Honor", callsign: "WARHN", number: 75, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "War + drama, 5.5+.", filter: and(genre("War"), genre("Drama"), aud("5.5")) },
      { key: "the-stage", name: "The Stage", callsign: "STAGE", number: 78, minItems: 3, mediaTypes: both, ordering: "SHUFFLE", description: "Musical + drama, 5.5+.", filter: and(genre("Musical"), genre("Drama"), aud("5.5")) },
      { key: "indie-drama", name: "Indie Drama", callsign: "INDIE", number: 79, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Indie-studio drama.", filter: and(genre("Drama"), anyStudio("A24", "IFC Films", "Fox Searchlight", "Searchlight Pictures", "Focus Features", "Neon", "Bleecker Street")) },
    ],
  },
  {
    key: "action-scifi",
    name: "Action & Sci-Fi",
    description: "Thrills, heroes & other worlds.",
    icon: "lucide:Rocket",
    tint: "orange",
    sortIndex: 5,
    channels: [
      { key: "action-zone", name: "Action Zone", callsign: "ACTZN", number: 80, minItems: 15, mediaTypes: both, ordering: "SHUFFLE", description: "All action, 5.0+.", filter: and(genre("Action"), aud("5")) },
      { key: "action-movies", name: "Action Movies", callsign: "ACTMV", number: 81, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Action movies, 75+ min, 5.0+.", filter: and(genre("Action"), durGte("75"), aud("5")) },
      { key: "scifi-universe", name: "Sci-Fi Universe", callsign: "SCIUN", number: 82, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Science fiction, 5.0+.", filter: and(anyGenre("Science Fiction", "Sci-Fi"), aud("5")) },
      { key: "fantasy-realm", name: "Fantasy Realm", callsign: "FNTSY", number: 83, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Fantasy, 5.0+.", filter: and(genre("Fantasy"), aud("5")) },
      { key: "explosive", name: "Explosive Cinema", callsign: "EXPLO", number: 87, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Action movies 75+ min, 6.0+ aud, 4.0+ crit.", filter: and(genre("Action"), durGte("75"), aud("6"), crit("4")) },
      { key: "adventure-hour", name: "Adventure Hour", callsign: "ADVHR", number: 96, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Adventure, 5.0+.", filter: and(genre("Adventure"), aud("5")) },
      { key: "western-frontier", name: "Western Frontier", callsign: "WSTFR", number: 98, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Westerns, 5.0+.", filter: and(genre("Western"), aud("5")) },
      { key: "scifi-classics", name: "Sci-Fi Classics", callsign: "SFCLC", number: 99, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Sci-fi, 1950s–1990s.", filter: and(anyGenre("Science Fiction", "Sci-Fi"), or(decade("1950"), decade("1960"), decade("1970"), decade("1980"), decade("1990"))) },
    ],
  },
  {
    key: "crime",
    name: "Crime & Mystery",
    description: "Whodunits & suspense.",
    icon: "lucide:Fingerprint",
    tint: "indigo",
    sortIndex: 6,
    channels: [
      { key: "crime-central", name: "Crime Central", callsign: "CRMCN", number: 100, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Crime, mature, 5.0+.", filter: and(genre("Crime"), aud("5")) },
      { key: "mystery-theater", name: "Mystery Theater", callsign: "MYSTR", number: 101, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Mystery, 5.5+.", filter: and(genre("Mystery"), aud("5.5")) },
      { key: "thriller-peak", name: "Thriller Peak", callsign: "THRLP", number: 102, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Thriller, 5.5+.", filter: and(genre("Thriller"), aud("5.5")) },
      { key: "suspense-theater", name: "Suspense Theater", callsign: "SSPNS", number: 110, minItems: 5, mediaTypes: both, ordering: "IN_ORDER", sortField: "audienceRating", sortDir: "desc", description: "Thriller/mystery 7.0+ aud, 6.0+ crit.", filter: and(anyGenre("Thriller", "Mystery"), aud("7"), crit("6")) },
      { key: "crime-movies", name: "Crime Movies", callsign: "CRMMV", number: 111, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Crime movies, 75+ min, 5.5+.", filter: and(genre("Crime"), durGte("75"), aud("5.5")) },
      { key: "crime-series", name: "Crime Series", callsign: "CRMSR", number: 112, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "TV crime, 5.5+.", filter: and(genre("Crime"), aud("5.5")) },
    ],
  },
  {
    key: "horror",
    name: "Horror",
    description: "Scares, supernatural & the macabre.",
    icon: "lucide:Ghost",
    tint: "red",
    sortIndex: 7,
    channels: [
      { key: "fright-night", name: "Fright Night", callsign: "FRGHT", number: 120, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Horror, mature, 4.5+.", filter: and(genre("Horror"), aud("4.5")) },
      { key: "horror-movies", name: "Horror Movies", callsign: "HORRM", number: 121, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Horror movies, 70+ min.", filter: and(genre("Horror"), durGte("70"), aud("4.5")) },
      { key: "horror-series", name: "Horror Series", callsign: "HRRSR", number: 122, minItems: 5, mediaTypes: tv, ordering: "SHUFFLE", description: "TV horror, 5.0+.", filter: and(genre("Horror"), aud("5")) },
      { key: "horror-comedy", name: "Horror Comedy", callsign: "HRCMD", number: 123, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Horror + comedy.", filter: and(genre("Horror"), genre("Comedy"), aud("5")) },
      { key: "elevated-horror", name: "Elevated Horror", callsign: "ELVHR", number: 124, minItems: 3, mediaTypes: movie, ordering: "SHUFFLE", description: "Prestige-studio horror, 7.0+ aud.", filter: and(genre("Horror"), aud("7"), anyStudio("A24", "Neon", "Blumhouse Productions", "IFC Films")) },
      { key: "classic-monsters", name: "Classic Monsters", callsign: "CLSMN", number: 127, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Horror, 1930s–1980s.", filter: and(genre("Horror"), or(decade("1930"), decade("1940"), decade("1950"), decade("1960"), decade("1970"), decade("1980"))) },
      { key: "creature-feature", name: "Creature Feature", callsign: "CRFTR", number: 133, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Horror + sci-fi.", filter: and(genre("Horror"), anyGenre("Science Fiction", "Sci-Fi")) },
    ],
  },
  {
    key: "documentary",
    name: "Documentary",
    description: "Nature, science, history & more.",
    icon: "lucide:BookOpen",
    tint: "teal",
    sortIndex: 8,
    channels: [
      { key: "doc-central", name: "Doc Central", callsign: "DOCCN", number: 140, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "All documentaries, 5.0+.", filter: and(genre("Documentary"), aud("5")) },
      { key: "history-vault", name: "History Vault", callsign: "HSTVT", number: 142, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Doc + history, 5.5+.", filter: and(genre("Documentary"), genre("History"), aud("5.5")) },
      { key: "war-stories", name: "War Stories", callsign: "WARST", number: 144, minItems: 3, mediaTypes: both, ordering: "SHUFFLE", description: "Doc + war.", filter: and(genre("Documentary"), genre("War")) },
      { key: "music-docs", name: "Music Docs", callsign: "MUSDC", number: 150, minItems: 3, mediaTypes: both, ordering: "SHUFFLE", description: "Doc + music, 5.0+.", filter: and(genre("Documentary"), genre("Music"), aud("5")) },
      { key: "sports-stories", name: "Sports Stories", callsign: "SPTST", number: 154, minItems: 3, mediaTypes: both, ordering: "SHUFFLE", description: "Doc + sport, 5.5+.", filter: and(genre("Documentary"), genre("Sport"), aud("5.5")) },
    ],
  },
  {
    key: "international",
    name: "International",
    description: "Global cinema from around the world.",
    icon: "lucide:Globe",
    tint: "cyan",
    sortIndex: 9,
    channels: [
      countryChannel("japanese-cinema", 161, "Japanese Cinema", "JPNCN", ["Japan"]),
      countryChannel("bollywood", 162, "Bollywood Nights", "BOLLY", ["India"]),
      countryChannel("kdrama", 163, "K-Drama & More", "KDRAM", ["South Korea"]),
      countryChannel("nordic-noir", 164, "Nordic Noir", "NRDNR", ["Sweden", "Denmark", "Norway", "Finland", "Iceland"], "5.5"),
      countryChannel("french", 165, "French Connection", "FRNCH", ["France"]),
      countryChannel("german", 166, "German Kino", "GRMKN", ["Germany", "Austria"]),
      countryChannel("latin", 167, "Latin Heat", "LATHT", ["Mexico", "Brazil", "Argentina", "Colombia", "Chile", "Peru", "Spain", "Cuba"]),
      countryChannel("british", 168, "British Telly", "BRITT", ["United Kingdom"]),
      countryChannel("italian", 169, "Italian Style", "ITLST", ["Italy"]),
      countryChannel("chinese", 170, "Chinese Cinema", "CHNCN", ["China", "Hong Kong", "Taiwan"]),
      countryChannel("canadian", 171, "Canadian Screen", "CANSC", ["Canada"]),
      countryChannel("down-under", 172, "Down Under", "DWNUN", ["Australia", "New Zealand"]),
      countryChannel("middle-east", 173, "Middle Eastern Tales", "MDEST", ["Iran", "Turkey", "Israel", "Egypt", "Lebanon"]),
      countryChannel("african", 174, "African Stories", "AFRST", ["Nigeria", "South Africa", "Kenya", "Ghana"]),
      countryChannel("eastern-euro", 175, "Eastern European", "EEURP", ["Russia", "Poland", "Czech Republic", "Hungary", "Romania"]),
    ],
  },
  {
    key: "time-machine",
    name: "Time Machine",
    description: "Travel through the decades.",
    icon: "lucide:Clock",
    tint: "amber",
    sortIndex: 11,
    channels: [
      decadeChannel("golden-age", 200, "Golden Age Cinema", "GLDNC", "1930", movie),
      decadeChannel("silver-screen", 201, "Silver Screen", "SLVSC", "1950", movie),
      decadeChannel("sixties", 202, "Swinging Sixties", "SWG60", "1960"),
      decadeChannel("seventies", 203, "Groovy Seventies", "GRV70", "1970"),
      decadeChannel("eighties", 204, "Totally Eighties", "TTL80", "1980"),
      decadeChannel("nineties", 205, "Nineties Nostalgia", "NST90", "1990"),
      decadeChannel("y2k", 206, "Y2K Era", "Y2KER", "2000"),
      decadeChannel("twenty-tens", 207, "Twenty-Tens", "TN10S", "2010"),
      decadeChannel("the-now", 208, "The Now", "THNOW", "2020"),
      { key: "peak-tv", name: "Peak TV", callsign: "PKTV", number: 212, minItems: 5, mediaTypes: tv, ordering: "SHUFFLE", description: "TV from the 2000s–2010s, 8.0+.", filter: and(or(decade("2000"), decade("2010")), aud("8")) },
      { key: "retro-cartoons", name: "Retro Cartoons", callsign: "RTCRN", number: 216, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Animation, 1950s–1990s.", filter: and(genre("Animation"), or(decade("1950"), decade("1960"), decade("1970"), decade("1980"), decade("1990"))) },
      { key: "classic-tv", name: "Classic TV", callsign: "CLKTV", number: 217, minItems: 5, mediaTypes: tv, ordering: "SHUFFLE", description: "TV, 1950s–1980s.", filter: or(decade("1950"), decade("1960"), decade("1970"), decade("1980")) },
    ],
  },
  {
    key: "directors",
    name: "Director's Chair",
    description: "Auteur cinema, curated by filmmaker.",
    icon: "lucide:Megaphone",
    tint: "violet",
    sortIndex: 12,
    channels: [
      directorChannel("spielberg", 220, "The Spielberg Reel", "SPLBG", "Steven Spielberg"),
      directorChannel("nolan", 221, "The Nolan Experience", "NOLAN", "Christopher Nolan"),
      directorChannel("tarantino", 222, "Tarantino's Vault", "TRNTN", "Quentin Tarantino"),
      directorChannel("scorsese", 223, "Scorsese Cinema", "SCRSE", "Martin Scorsese"),
      directorChannel("kubrick", 225, "Kubrick's Eye", "KBRCK", "Stanley Kubrick"),
      directorChannel("fincher", 226, "Fincher Files", "FNCHR", "David Fincher"),
      directorChannel("hitchcock", 227, "Hitchcock Hour", "HTCHK", "Alfred Hitchcock"),
      directorChannel("burton", 228, "Burton's Workshop", "BRTWN", "Tim Burton"),
      directorChannel("villeneuve", 229, "Villeneuve Visions", "VLNVE", "Denis Villeneuve"),
      directorChannel("wes-anderson", 230, "Anderson's World", "WESAD", "Wes Anderson"),
      directorChannel("del-toro", 231, "Del Toro's Labyrinth", "DLTRO", "Guillermo del Toro"),
      directorChannel("cameron", 232, "Cameron's Frontier", "CMRNS", "James Cameron"),
      directorChannel("peele", 233, "The Peele Zone", "PEELZ", "Jordan Peele"),
      directorChannel("pta", 234, "PTA Presents", "PTAPR", "Paul Thomas Anderson"),
      directorChannel("miyazaki", 235, "Miyazaki's Garden", "MYZKI", "Hayao Miyazaki", true),
      directorChannel("bong", 236, "Bong's Theater", "BONGS", "Bong Joon-ho"),
      directorChannel("aster", 237, "Aster's Nightmare", "ASTRN", "Ari Aster"),
      directorChannel("kurosawa", 238, "Kurosawa Classics", "KRSWA", "Akira Kurosawa"),
      directorChannel("gerwig", 239, "Gerwig's Lens", "GRWGS", "Greta Gerwig"),
      directorChannel("lynch", 242, "Lynch's Dream", "LYNCH", "David Lynch"),
      directorChannel("spike-lee", 244, "Spike's Joint", "SPIKE", "Spike Lee"),
      directorChannel("mann", 245, "Mann's Heat", "MANNS", "Michael Mann"),
      directorChannel("sofia-coppola", 246, "Sofia's Diary", "SOFCP", "Sofia Coppola"),
      directorChannel("ridley-scott", 247, "Ridley's Kingdom", "RDLYS", "Ridley Scott"),
      directorChannel("eastwood", 248, "Eastwood Avenue", "ESTWN", "Clint Eastwood"),
    ],
  },
  {
    key: "star-power",
    name: "Star Power",
    description: "Channels dedicated to the greats.",
    icon: "lucide:Star",
    tint: "pink",
    sortIndex: 13,
    channels: [
      actorChannel("hanks", 250, "The Hanks Collection", "HANKS", "Tom Hanks", "5"),
      actorChannel("denzel", 251, "Denzel's Stage", "DNZLS", "Denzel Washington", "5"),
      actorChannel("dicaprio", 252, "DiCaprio Cinema", "DCPRO", "Leonardo DiCaprio", "5"),
      actorChannel("streep", 253, "The Streep Effect", "STREP", "Meryl Streep", "5"),
      actorChannel("keanu", 254, "Keanu's World", "KEANU", "Keanu Reeves", "5"),
      actorChannel("samuel-l", 255, "Samuel L. Theater", "SAMJK", "Samuel L. Jackson", "5"),
      actorChannel("the-rock", 256, "The Rock Block", "ROCKB", "Dwayne Johnson", "4.5"),
      actorChannel("cage", 260, "The Cage", "NCAGE", "Nicolas Cage"),
      actorChannel("pitt", 261, "Pitt Stop", "PITTS", "Brad Pitt", "5"),
      actorChannel("freeman", 262, "Freeman Narrates", "FRMNS", "Morgan Freeman", "5"),
      actorChannel("blanchett", 263, "Blanchett's Stage", "BLNCH", "Cate Blanchett", "5"),
      actorChannel("jackman", 264, "Jackman's Range", "JCKMN", "Hugh Jackman", "5"),
      actorChannel("cruise", 265, "Cruise Control", "CRUIS", "Tom Cruise", "5"),
      actorChannel("scarlett", 266, "Scarlett Spotlight", "SCRLT", "Scarlett Johansson", "5"),
      actorChannel("joaquin", 267, "Joaquin's Method", "JQNPH", "Joaquin Phoenix", "5"),
      actorChannel("gosling", 268, "The Gosling", "GSLNG", "Ryan Gosling", "5"),
      actorChannel("will-smith", 270, "Will Power", "WLPWR", "Will Smith", "5"),
      actorChannel("robbie", 272, "Robbie's Reel", "MRGTR", "Margot Robbie", "5"),
      actorChannel("cranston", 273, "The Cranston", "CRNST", "Bryan Cranston", "5"),
      actorChannel("driver", 274, "Driver's Seat", "DRVRS", "Adam Driver", "5"),
      actorChannel("chalamet", 275, "Chalamet's Rise", "CHLMT", "Timothée Chalamet", "5"),
      actorChannel("viola", 276, "Viola's Voice", "VIOLA", "Viola Davis", "5"),
      actorChannel("sandler", 277, "Sandler's Shack", "SNDLR", "Adam Sandler"),
    ],
  },
  {
    key: "studios",
    name: "Studio Spotlight",
    description: "The best from top studios.",
    icon: "lucide:Building2",
    tint: "blue",
    sortIndex: 17,
    channels: [
      studioChannel("a24", 380, "A24 Presents", "A24TV", ["A24"]),
      studioChannel("hbo", 381, "HBO Theater", "HBOTH", ["HBO", "HBO Films", "HBO Max"]),
      studioChannel("fx", 382, "FX Originals", "FXORG", ["FX", "FX Productions"]),
      studioChannel("amc", 383, "AMC Premiere", "AMCPR", ["AMC", "AMC Studios"]),
      studioChannel("blumhouse", 384, "Blumhouse Horror", "BLMHS", ["Blumhouse Productions"]),
      studioChannel("netflix", 385, "Netflix Originals", "NFLXO", ["Netflix"]),
      studioChannel("apple", 386, "Apple Originals", "APLOR", ["Apple TV+", "Apple Studios"]),
      studioChannel("criterion", 389, "Criterion Collection", "CRITN", ["The Criterion Collection", "Janus Films"], "7"),
      studioChannel("disney", 390, "Disney Vault", "DSNVT", ["Walt Disney Pictures", "Walt Disney Animation Studios", "Walt Disney Studios"]),
      studioChannel("warner", 391, "Warner Bros Classics", "WRNBR", ["Warner Bros. Pictures", "New Line Cinema"]),
      studioChannel("universal", 392, "Universal Pictures", "UNIVP", ["Universal Pictures"]),
      studioChannel("paramount", 393, "Paramount Theater", "PRMNT", ["Paramount Pictures", "Paramount+"]),
      studioChannel("lionsgate", 394, "Lionsgate", "LNSGR", ["Lionsgate", "Summit Entertainment"]),
      studioChannel("sony", 395, "Sony Pictures", "SNYPC", ["Sony Pictures", "Columbia Pictures", "TriStar Pictures"]),
      studioChannel("mgm", 396, "MGM Classics", "MGMCL", ["Metro-Goldwyn-Mayer", "United Artists"]),
      studioChannel("ghibli", 397, "Studio Ghibli", "GHBLI", ["Studio Ghibli"]),
      studioChannel("showtime", 398, "Showtime Originals", "SHWTM", ["Showtime", "Showtime Networks"]),
    ],
  },
  {
    key: "curated",
    name: "Curated & Mood",
    description: "Channels for every vibe.",
    icon: "lucide:Sparkles",
    tint: "purple",
    sortIndex: 15,
    channels: [
      { key: "binge-worthy", name: "Binge Worthy", callsign: "BNGWR", number: 310, minItems: 5, mediaTypes: tv, ordering: "IN_ORDER", sortField: "audienceRating", sortDir: "desc", description: "TV 8.0+.", filter: aud("8") },
      { key: "critics-darlings", name: "Critics' Darlings", callsign: "CRTDR", number: 313, minItems: 5, mediaTypes: both, ordering: "IN_ORDER", sortField: "audienceRating", sortDir: "desc", description: "8.5+.", filter: aud("8.5") },
      { key: "hidden-gems", name: "Hidden Gems", callsign: "HIDGM", number: 316, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "7.0–8.0.", filter: and(aud("7"), cond("audienceRating", "lte", "8")) },
      { key: "4k-theater", name: "4K Theater", callsign: "4KTHR", number: 318, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "4K, 7.0+.", filter: and(res("4K"), aud("7")) },
      { key: "feel-good", name: "Feel Good", callsign: "FLGCH", number: 321, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Comedy/family/romance, 7.0+.", filter: and(anyGenre("Comedy", "Family", "Romance"), aud("7")) },
      { key: "nostalgia-trip", name: "Nostalgia Trip", callsign: "NSTTR", number: 329, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "1980s–1990s, 7.0+.", filter: and(or(decade("1980"), decade("1990")), aud("7")) },
      { key: "fresh-picks", name: "Fresh Picks", callsign: "FRSHP", number: 330, minItems: 3, mediaTypes: both, ordering: "IN_ORDER", sortField: "addedAt", sortDir: "desc", description: "Added last 60 days, 6.5+.", filter: and(addedWithin("60"), aud("6.5")) },
      { key: "epic-length", name: "Epic Length", callsign: "EPICL", number: 332, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Movies 150+ min, 7.0+.", filter: and(durGte("150"), aud("7")) },
      { key: "rewatchable", name: "Rewatchable", callsign: "RWCHB", number: 335, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "8.0+.", filter: aud("8") },
      { key: "unwatched-vault", name: "The Unwatched Vault", callsign: "UNWVT", number: 339, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "7.0+, unwatched.", filter: and(aud("7"), unwatched()) },
    ],
  },
  {
    key: "special",
    name: "Special Purpose",
    description: "4K, unwatched, seasonal & more.",
    icon: "lucide:Settings2",
    tint: "slate", // was "gray" — retired token; slate is its accent-palette equivalent
    sortIndex: 18,
    channels: [
      { key: "4k-ultra", name: "4K Ultra", callsign: "4KULT", number: 400, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "4K only.", filter: res("4K") },
      { key: "hd-only", name: "HD Only", callsign: "HDOLY", number: 401, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "1080p+.", filter: or(res("1080p"), res("4K")) },
      { key: "just-added", name: "Just Added", callsign: "JSTAD", number: 402, minItems: 1, mediaTypes: both, ordering: "IN_ORDER", sortField: "addedAt", sortDir: "desc", description: "Added in the last 7 days.", filter: addedWithin("7") },
      { key: "new-this-month", name: "New This Month", callsign: "NWMTH", number: 403, minItems: 1, mediaTypes: both, ordering: "IN_ORDER", sortField: "addedAt", sortDir: "desc", description: "Added in the last 30 days.", filter: addedWithin("30") },
      { key: "unwatched-movies", name: "Unwatched Movies", callsign: "UNWMV", number: 405, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Unwatched movies.", filter: unwatched() },
      { key: "unwatched-series", name: "Unwatched Series", callsign: "UNWSR", number: 406, minItems: 5, mediaTypes: tv, ordering: "SHUFFLE", description: "Unwatched episodes.", filter: unwatched() },
      { key: "lunch-break", name: "Lunch Break", callsign: "LNCHB", number: 408, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Under 45 minutes.", filter: durLte("45") },
      { key: "movie-matinee", name: "Movie Matinee", callsign: "MVMAT", number: 409, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Movies 60–100 min.", filter: and(durGte("60"), durLte("100")) },
      { key: "top-shelf", name: "Top Shelf", callsign: "TPSHF", number: 415, minItems: 3, mediaTypes: both, ordering: "IN_ORDER", sortField: "audienceRating", sortDir: "desc", description: "9.0+.", filter: aud("9") },
      { key: "family-safe", name: "Family Safe", callsign: "FMSAF", number: 417, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "G / PG / TV-G / TV-PG / TV-Y / TV-Y7.", filter: familySafe() },
      { key: "mature-only", name: "Mature Only", callsign: "MATRL", number: 418, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "R / TV-MA / NC-17.", filter: mature() },
    ],
  },
];
