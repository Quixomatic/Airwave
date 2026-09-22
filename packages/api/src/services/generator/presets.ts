import { createHash } from "node:crypto";

import type { FilterCondition, FilterGroupNode, FilterNode, FilterOp } from "../plex/filter-fields";
import type { ChannelStrategy } from "../schedule/timeline";

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
  /** OPTIONAL grouping/rotation strategy layered over `ordering` (§7.6). Stored on `Channel.strategy`. */
  strategy?: ChannelStrategy;
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
const notGenre = (g: string) => cond("genre", "isNot", g);
// TV brands live in `network` (the airing channel); `studio` on a show is the production company, so TV
// brands (HBO/FX/…) must match on network or come up empty. Verified against the library.
const network = (n: string) => cond("network", "is", n);
const anyNetwork = (...ns: string[]) => or(...ns.map(network));

// Genre aliases — Plex's movie agent and TV agent tag the same concept differently, and both spellings
// coexist in the show library. Verified present via scripts/probe-preset-filters.ts:
//   movies: "Science Fiction", "Action", "Adventure", "War"
//   shows:  ALSO "Sci-Fi & Fantasy", "Action/Adventure", "War & Politics"  (and "Science Fiction"/"Action" too)
// There is no plain "Sci-Fi" tag in either library. Match every spelling a concept can wear.
const SCIFI = () => anyGenre("Science Fiction", "Sci-Fi & Fantasy");
const ACTION = () => anyGenre("Action", "Action/Adventure");
const ADVENTURE = () => anyGenre("Adventure", "Action/Adventure");
const WAR = () => anyGenre("War", "War & Politics");
const KIDS_GENRE = () => anyGenre("Children", "Family", "Animation");

const FAMILY_SAFE = ["G", "PG", "TV-Y", "TV-Y7", "TV-G", "TV-PG"];
const MATURE = ["R", "TV-MA", "NC-17"];
const familySafe = () => or(...FAMILY_SAFE.map(rating));
const mature = () => or(...MATURE.map(rating));
// Stricter than familySafe: drops TV-PG, which is where shōnen anime (Naruto etc.) leaks into kids channels.
const KIDS = ["G", "PG", "TV-Y", "TV-Y7", "TV-G"];
const kidsSafe = () => or(...KIDS.map(rating));
const TWEEN = ["PG", "PG-13", "TV-PG", "TV-14"];
const tweenRated = () => or(...TWEEN.map(rating));
const GROWN_UP_RATINGS = ["PG-13", "R", "TV-14", "TV-MA"];
const grownUpRated = () => or(...GROWN_UP_RATINGS.map(rating));
// Keeps adult western animation (Rick and Morty, Invincible) but drops the anime + kids-cartoon episode
// floods (Pokémon 587ep, Naruto 500ep, Sesame Street 682ep) from grown-up genre channels. Relies on the
// resolver dropping an absent-tag negation, so it's a safe no-op on libraries without those genres.
const grownUp = () => and(notGenre("Anime"), notGenre("Children"));

const both: MediaType[] = ["movie", "show"];
const movie: MediaType[] = ["movie"];
const tv: MediaType[] = ["show"];

// Group-by-show round robin. Any channel that resolves TV resolves it at the EPISODE level, so a long-runner
// (Sesame Street 682ep, Pokémon 587ep) would hog the airtime in a plain shuffle. This does NOT change WHICH
// items are eligible (the filter decides that) — it changes what PLAYS: a short block of 1-3 episodes per
// show (seeded per lap), show order reshuffled each lap, so every eligible show gets fair rotation regardless
// of episode count. `[1, 3]` is the natural TV-channel feel (a couple in a row, then move on) — a plain count,
// not the duration-block form (which is only needed for very short episodes like Bluey). Applied (via
// `withShowRotation` below) to every SHUFFLE channel that can pull TV; IN_ORDER channels keep their sort.
const SHOW_ROTATION: ChannelStrategy = {
  rotation: "round_robin",
  rotationOrder: "shuffle",
  grouping: [{ scope: "show", run: [1, 3] }],
};

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

/**
 * A studio / network brand channel. `studio` on a show is the PRODUCTION COMPANY (e.g. "Revolution Sun
 * Studios" for Game of Thrones), NOT the channel it aired on — that's `network`. So film studios (Disney,
 * Warner, ...) match on `studio` and are movie-only (their TV arms use different studio names), while TV
 * brands / streamers (HBO, FX, Netflix, ...) must also match on `network` and are `both`. Pass `networks` to
 * make a channel a TV brand; without it the channel is film-studio, movie-only.
 */
const studioChannel = (
  key: string,
  number: number,
  name: string,
  callsign: string,
  studios: string[],
  opts: { networks?: string[]; floor?: string; types?: MediaType[]; grownUp?: boolean } = {},
): PresetChannel => {
  const who = [...studios.map(studio), ...(opts.networks ?? []).map(network)];
  const match = who.length > 1 ? or(...who) : who[0]!;
  // `grownUp` drops the kids cartoons that network-match a prestige brand (Sesame Street airs on HBO/Max but
  // does not belong in "HBO Theater"). Opt-in so a future kids-network brand isn't wrongly stripped.
  const parts: FilterNode[] = [match];
  if (opts.grownUp) parts.push(grownUp());
  if (opts.floor) parts.push(aud(opts.floor));
  return {
    key,
    name,
    callsign,
    number,
    minItems: 5,
    mediaTypes: opts.types ?? (opts.networks ? both : movie),
    ordering: "SHUFFLE",
    description: `Everything from ${name}.`,
    filter: parts.length > 1 ? and(...parts) : parts[0]!,
  };
};

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

const RAW_PACKAGES: PresetPackage[] = [
  {
    key: "basic",
    name: "Basic",
    description: "Essential broadcast channels.",
    icon: "lucide:Radio",
    tint: "sky",
    sortIndex: 1,
    channels: [
      { key: "prime-time", name: "Prime Time", callsign: "PRIME", number: 3, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Star", description: "The good stuff: rated 7.5+ by audiences.", filter: and(aud("7.5"), grownUp()) },
      { key: "fresh", name: "Fresh Off the Press", callsign: "FRESH", number: 4, minItems: 1, mediaTypes: both, ordering: "IN_ORDER", sortField: "addedAt", sortDir: "desc", icon: "lucide:Sparkles", description: "Added to your library in the last 30 days.", filter: addedWithin("30") },
      { key: "family-hour", name: "Family Hour", callsign: "FAMHR", number: 6, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Baby", description: "G / PG / TV-Y / TV-Y7 / TV-G / TV-PG only.", filter: familySafe() },
      { key: "movie-marquee", name: "Movie Marquee", callsign: "MOVMQ", number: 7, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", icon: "lucide:Film", description: "Movies only, 60+ minutes.", filter: durGte("60") },
      { key: "series-central", name: "Series Central", callsign: "SRSCT", number: 8, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", icon: "lucide:MonitorPlay", description: "Every TV series in your library." },
      { key: "quick-bites", name: "Quick Bites", callsign: "QKBTS", number: 9, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", icon: "lucide:Timer", description: "Short films under 45 minutes.", filter: durLte("45") },
      { key: "popcorn", name: "Popcorn Movies", callsign: "PPCRN", number: 10, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", icon: "lucide:Popcorn", description: "Crowd-pleasing movies, 7.5+ audience, 75+ min.", filter: and(aud("7.5"), crit("6"), durGte("75")) },
      { key: "uhd", name: "Ultra HD Theater", callsign: "UHD4K", number: 12, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", icon: "lucide:Tv", description: "4K content only.", filter: res("4K") },
      { key: "critics-choice", name: "Critics' Choice", callsign: "CRITC", number: 14, minItems: 5, mediaTypes: movie, ordering: "IN_ORDER", sortField: "criticRating", sortDir: "desc", icon: "lucide:Award", description: "Movies rated 8.0+ audience, 7.5+ critic.", filter: and(aud("8"), crit("7.5")) },
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
      { key: "toon-town", name: "Toon Town", callsign: "TOONS", number: 20, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", icon: "lucide:Palette", description: "Animated series for the whole family.", filter: and(genre("Animation"), familySafe()) },
      { key: "family-movie-night", name: "Family Movie Night", callsign: "FMMOV", number: 21, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Family movies, 60+ min, G–PG.", filter: and(anyGenre("Family", "Comedy", "Adventure", "Animation"), durGte("60"), or(rating("G"), rating("PG"))) },
      { key: "saturday-morning", name: "Saturday Morning", callsign: "SATAM", number: 22, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "Kids TV for younger viewers.", filter: and(KIDS_GENRE(), kidsSafe()) },
      { key: "laugh-track-jr", name: "Laugh Track Jr", callsign: "LTJR", number: 24, minItems: 5, mediaTypes: tv, ordering: "SHUFFLE", description: "Kids comedy series.", filter: and(genre("Comedy"), KIDS_GENRE(), kidsSafe()) },
      { key: "bedtime-stories", name: "Bedtime Stories", callsign: "BEDTM", number: 27, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Gentle animated films under 90 minutes.", filter: and(genre("Animation"), durLte("90"), kidsSafe()) },
      { key: "musical-kids", name: "Musical Kids", callsign: "MUSKD", number: 29, minItems: 3, mediaTypes: both, ordering: "SHUFFLE", description: "Kids musicals and sing-alongs.", filter: and(anyGenre("Musical", "Music"), KIDS_GENRE(), kidsSafe()) },
      { key: "anime-adventures", name: "Anime Adventures", callsign: "ANMAD", number: 30, minItems: 5, mediaTypes: tv, ordering: "SHUFFLE", description: "Family-friendly anime series.", filter: and(genre("Anime"), or(kidsSafe(), tweenRated())) },
      { key: "tween-scene", name: "Tween Scene", callsign: "TWEEN", number: 32, minItems: 5, mediaTypes: tv, ordering: "SHUFFLE", description: "Tween series, PG–TV-14.", filter: and(genre("Family"), anyGenre("Comedy", "Drama"), tweenRated()) },
      { key: "cartoon-classics", name: "Cartoon Classics", callsign: "CLSCR", number: 33, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Animation, 1950s–1990s.", filter: and(genre("Animation"), or(decade("1950"), decade("1960"), decade("1970"), decade("1980"), decade("1990"))) },
      { key: "storytime", name: "Storytime Theater", callsign: "STORY", number: 34, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Fairy tales and fantasy family films.", filter: and(genre("Fantasy"), durGte("60"), familySafe()) },
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
      { key: "comedy-channel", name: "The Comedy Channel", callsign: "COMDY", number: 40, minItems: 15, mediaTypes: both, ordering: "SHUFFLE", description: "Grown-up comedy, 5.0+.", filter: and(genre("Comedy"), aud("5"), grownUp()) },
      { key: "sitcom-city", name: "Sitcom City", callsign: "SITCM", number: 41, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "TV comedy and sitcoms.", filter: and(genre("Comedy"), grownUp()) },
      { key: "comedy-cinema", name: "Comedy Cinema", callsign: "CMDCN", number: 42, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Comedy movies, 60+ min.", filter: and(genre("Comedy"), durGte("60")) },
      { key: "dark-laughs", name: "Dark Laughs", callsign: "DRKLF", number: 43, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Dark comedy: laughs with a body count.", filter: and(genre("Comedy"), anyGenre("Horror", "Thriller", "Crime"), mature()) },
      { key: "rom-com", name: "Rom-Com Radio", callsign: "ROMCM", number: 46, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Romantic comedy films.", filter: and(genre("Romance"), genre("Comedy"), notGenre("Animation")) },
      { key: "animated-laughs", name: "Animated Laughs", callsign: "ANLFS", number: 47, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Grown-up cartoons: the Adult Swim vibe.", filter: and(genre("Comedy"), genre("Animation"), notGenre("Anime"), or(rating("TV-14"), rating("TV-MA"), rating("R"))) },
      { key: "family-comedy", name: "Family Comedy", callsign: "FAMCM", number: 49, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Comedy the whole family can watch.", filter: and(genre("Comedy"), genre("Family")) },
      { key: "comedy-gold", name: "Comedy Gold", callsign: "CMDGD", number: 50, minItems: 10, mediaTypes: movie, ordering: "IN_ORDER", sortField: "audienceRating", sortDir: "desc", description: "The best-rated comedy films, 7.5+.", filter: and(genre("Comedy"), aud("7.5")) },
      { key: "late-night-laughs", name: "Late Night Laughs", callsign: "LTNLF", number: 52, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Mature comedy, 5.0+.", filter: and(genre("Comedy"), mature(), aud("5")) },
      { key: "comedy-classics", name: "Comedy Classics", callsign: "CLSCM", number: 56, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "Classic comedy, 1950s–1980s.", filter: and(genre("Comedy"), or(decade("1950"), decade("1960"), decade("1970"), decade("1980")), grownUp()) },
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
      { key: "drama-central", name: "Drama Central", callsign: "DRCTV", number: 60, minItems: 15, mediaTypes: both, ordering: "SHUFFLE", description: "All drama, 5.5+.", filter: and(genre("Drama"), aud("5.5"), grownUp()) },
      { key: "movie-dramas", name: "Movie Dramas", callsign: "DRMAM", number: 61, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Drama movies, 75+ min, 5.5+.", filter: and(genre("Drama"), durGte("75"), aud("5.5")) },
      { key: "drama-series", name: "Drama Series", callsign: "DRMAS", number: 62, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "TV drama, 5.5+.", filter: and(genre("Drama"), aud("5.5"), grownUp()) },
      { key: "love-stories", name: "Love Stories", callsign: "LOVSN", number: 63, minItems: 10, mediaTypes: both, ordering: "SHUFFLE", description: "Romance, 5.0+.", filter: and(genre("Romance"), aud("5"), grownUp()) },
      { key: "prestige-tv", name: "Prestige TV", callsign: "PRSTG", number: 69, minItems: 5, mediaTypes: tv, ordering: "IN_ORDER", sortField: "audienceRating", sortDir: "desc", description: "Acclaimed drama series, 8.0+ (TV-14 / TV-MA).", filter: and(genre("Drama"), aud("8"), grownUp(), or(rating("TV-14"), rating("TV-MA"))) },
      { key: "war-honor", name: "War & Honor", callsign: "WARHN", number: 75, minItems: 5, mediaTypes: both, ordering: "SHUFFLE", description: "War drama, 5.5+.", filter: and(WAR(), genre("Drama"), aud("5.5"), grownUp()) },
      { key: "the-stage", name: "The Stage", callsign: "STAGE", number: 78, minItems: 3, mediaTypes: both, ordering: "SHUFFLE", description: "Musicals and stage-to-screen drama.", filter: and(genre("Musical"), genre("Drama"), aud("5.5"), grownUp()) },
      { key: "indie-drama", name: "Indie Drama", callsign: "INDIE", number: 79, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Independent drama.", filter: and(genre("Drama"), or(genre("Indie"), anyStudio("A24", "IFC Films", "Fox Searchlight", "Searchlight Pictures", "Focus Features", "Neon", "Bleecker Street"))) },
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
      { key: "action-zone", name: "Action Zone", callsign: "ACTZN", number: 80, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "Action and adventure series, 5.0+.", filter: and(ACTION(), aud("5"), grownUp()) },
      { key: "action-movies", name: "Action Movies", callsign: "ACTMV", number: 81, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Action movies, 75+ min, 5.0+.", filter: and(genre("Action"), durGte("75"), aud("5")) },
      { key: "scifi-universe", name: "Sci-Fi Universe", callsign: "SCIUN", number: 82, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "Science-fiction series, 5.0+.", filter: and(SCIFI(), aud("5"), grownUp()) },
      { key: "scifi-cinema", name: "Sci-Fi Cinema", callsign: "SCICN", number: 84, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Science-fiction films, 5.0+.", filter: and(SCIFI(), aud("5")) },
      { key: "fantasy-realm", name: "Fantasy Realm", callsign: "FNTSY", number: 83, minItems: 10, mediaTypes: tv, ordering: "SHUFFLE", description: "Fantasy series, 5.0+.", filter: and(genre("Fantasy"), aud("5"), grownUp()) },
      { key: "explosive", name: "Explosive Cinema", callsign: "EXPLO", number: 87, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Action movies 75+ min, 6.0+ aud, 4.0+ crit.", filter: and(genre("Action"), durGte("75"), aud("6"), crit("4")) },
      { key: "adventure-hour", name: "Adventure Hour", callsign: "ADVHR", number: 96, minItems: 10, mediaTypes: movie, ordering: "SHUFFLE", description: "Adventure films, 5.0+.", filter: and(ADVENTURE(), aud("5")) },
      { key: "western-frontier", name: "Western Frontier", callsign: "WSTFR", number: 98, minItems: 5, mediaTypes: tv, ordering: "SHUFFLE", description: "Western series, 5.0+.", filter: and(genre("Western"), aud("5")) },
      { key: "scifi-classics", name: "Sci-Fi Classics", callsign: "SFCLC", number: 99, minItems: 5, mediaTypes: movie, ordering: "SHUFFLE", description: "Classic sci-fi films, 1950s–1990s.", filter: and(SCIFI(), or(decade("1950"), decade("1960"), decade("1970"), decade("1980"), decade("1990"))) },
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
      // Film studios — match on `studio`, movie-only (their TV arms carry different studio names).
      studioChannel("a24", 380, "A24 Presents", "A24TV", ["A24"]),
      studioChannel("blumhouse", 384, "Blumhouse Horror", "BLMHS", ["Blumhouse Productions"]),
      studioChannel("criterion", 389, "Criterion Collection", "CRITN", ["The Criterion Collection", "Janus Films"], { floor: "7" }),
      studioChannel("disney", 390, "Disney Vault", "DSNVT", ["Walt Disney Pictures", "Walt Disney Animation Studios", "Walt Disney Studios"]),
      studioChannel("warner", 391, "Warner Bros Classics", "WRNBR", ["Warner Bros. Pictures", "New Line Cinema"]),
      studioChannel("universal", 392, "Universal Pictures", "UNIVP", ["Universal Pictures"]),
      studioChannel("lionsgate", 394, "Lionsgate", "LNSGR", ["Lionsgate", "Summit Entertainment"]),
      studioChannel("sony", 395, "Sony Pictures", "SNYPC", ["Sony Pictures", "Columbia Pictures", "TriStar Pictures"]),
      studioChannel("mgm", 396, "MGM Classics", "MGMCL", ["Metro-Goldwyn-Mayer", "United Artists"]),
      studioChannel("ghibli", 397, "Studio Ghibli", "GHBLI", ["Studio Ghibli"]),
      // TV brands / streamers — also match on `network` (the airing channel), so they carry series too.
      studioChannel("hbo", 381, "HBO Theater", "HBOTH", ["HBO", "HBO Films"], { networks: ["HBO", "HBO Max", "Max"], grownUp: true }),
      studioChannel("fx", 382, "FX Originals", "FXORG", ["FX Productions"], { networks: ["FX", "FXX"], grownUp: true }),
      studioChannel("amc", 383, "AMC Premiere", "AMCPR", ["AMC Studios"], { networks: ["AMC", "AMC+"], grownUp: true }),
      studioChannel("netflix", 385, "Netflix Originals", "NFLXO", ["Netflix"], { networks: ["Netflix"], grownUp: true }),
      studioChannel("apple", 386, "Apple Originals", "APLOR", ["Apple Studios", "Apple TV+"], { networks: ["Apple TV"], grownUp: true }),
      studioChannel("paramount", 393, "Paramount Theater", "PRMNT", ["Paramount Pictures"], { networks: ["Paramount+", "Paramount Network"], grownUp: true }),
      studioChannel("showtime", 398, "Showtime Originals", "SHWTM", ["Showtime Networks"], { networks: ["Showtime"], grownUp: true }),
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

/**
 * Give every SHUFFLE channel that can pull TV a group-by-show rotation, unless it already sets its own
 * strategy. IN_ORDER channels are left alone — their sort (by rating, by added date) IS the intended play
 * order, and round-robin would throw it away. Movie-only channels are unaffected (no shows to group).
 */
const withShowRotation = (ch: PresetChannel): PresetChannel =>
  ch.strategy || ch.ordering !== "SHUFFLE" || !ch.mediaTypes.includes("show")
    ? ch
    : { ...ch, strategy: SHOW_ROTATION };

export const PRESET_PACKAGES: PresetPackage[] = RAW_PACKAGES.map((pkg) => ({
  ...pkg,
  channels: pkg.channels.map(withShowRotation),
}));

// --- preset content hash (presetRev) ---------------------------------------

/**
 * Deterministic JSON: object keys sorted recursively so key ORDER never changes the string, while ARRAY
 * order is preserved (a filter's `children` order and `mediaTypes` order are semantically meaningful).
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * The content hash stored on a generated channel as `presetRev`. It fingerprints ONLY the fields that
 * define what the channel is and how it schedules, normalized to the same effective values the channel
 * row stores (so omitting an optional field hashes identically to setting it to its default). A build
 * compares this to the stored `presetRev`: equal → Unchanged (leave alone), differ → Update.
 *
 * Excludes `number` (runtime-assigned, bumped on collision) and `tint` (accent-cycled at generation) —
 * neither changes what the channel is.
 */
export function hashPresetChannel(ch: PresetChannel): string {
  const defining = {
    mediaTypes: ch.mediaTypes,
    ordering: ch.ordering,
    sortField: ch.sortField ?? "title",
    sortDir: ch.sortDir ?? "asc",
    filter: ch.filter ?? null,
    strategy: ch.strategy ?? null,
    minItems: ch.minItems,
    name: ch.name,
    callsign: ch.callsign,
    description: ch.description,
    icon: ch.icon ?? null,
  };
  return createHash("sha256").update(stableStringify(defining)).digest("hex");
}

/** Flat lookup of every preset channel by its stable `key`, across all packages. */
export const PRESET_CHANNELS_BY_KEY: Map<string, { pkg: PresetPackage; channel: PresetChannel }> = new Map(
  PRESET_PACKAGES.flatMap((pkg) => pkg.channels.map((channel) => [channel.key, { pkg, channel }] as const)),
);
