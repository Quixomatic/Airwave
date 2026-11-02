import type { GuideGridChannel, GuideMeta } from "@/lib/api";

/**
 * The sample guide the settings preview draws a theme on: six channels of programs around an evening, in minutes from the start of the
 * timeline, so the same lineup shows on any screen and at any time of day. Row 2 has its cell selected, row 3 its rail, one cell has
 * art and a few are on now, so every state a theme styles is on screen. Plain data, no react-native imports.
 */
export type SampleProgram = { start: number; length: number; title: string; rating?: string; year?: number; genre?: string; season?: number; episode?: number; art?: boolean };
export type SampleChannel = { number: number; name: string; icon: string; favorite?: boolean; programs: SampleProgram[] };

/** Minutes from the timeline's start to "now". The timeline starts at 8:01 PM, so now is 8:41 PM. */
export const SAMPLE_NOW_MIN = 40;
/** The row whose selected cell is shown, and the row whose rail is. */
export const SAMPLE_CELL_ROW = 1;
export const SAMPLE_RAIL_ROW = 2;

export const SAMPLE_CHANNELS: readonly SampleChannel[] = [
  {
    number: 101,
    name: "Metro News 7",
    icon: "lucide:Newspaper",
    favorite: true,
    programs: [
      { start: -25, length: 55, title: "Evening Edition", genre: "News", rating: "TV-G" },
      { start: 30, length: 30, title: "Metro Tonight", genre: "News", rating: "TV-G" },
      { start: 60, length: 60, title: "Harbor Lights", season: 3, episode: 7, rating: "TV-14" },
      { start: 120, length: 60, title: "The Late Edition", genre: "News", rating: "TV-G" },
    ],
  },
  {
    number: 102,
    name: "Cinema Two",
    icon: "lucide:Clapperboard",
    programs: [
      { start: -10, length: 110, title: "The Long Goodbye", year: 1973, rating: "R" },
      { start: 100, length: 80, title: "Night Shift", season: 4, episode: 2, rating: "TV-MA" },
    ],
  },
  {
    number: 103,
    name: "Sports One",
    icon: "lucide:Trophy",
    programs: [
      { start: 20, length: 50, title: "Playoff Preview", genre: "Sports", rating: "TV-G" },
      { start: 70, length: 110, title: "Game 5: Harbor vs. Summit, Live From the Arena", genre: "Sports", rating: "TV-PG" },
    ],
  },
  {
    number: 104,
    name: "Classic Reels",
    icon: "lucide:Film",
    programs: [
      { start: -15, length: 60, title: "The Last Lighthouse", year: 1958, rating: "NR" },
      { start: 45, length: 90, title: "Starfall: The Return", genre: "Sci-Fi", rating: "TV-PG", art: true },
      { start: 135, length: 45, title: "Short Subjects", genre: "Shorts", rating: "NR" },
    ],
  },
  {
    number: 105,
    name: "Groove TV",
    icon: "lucide:Music",
    favorite: true,
    programs: [
      { start: 35, length: 25, title: "Top 20 Countdown", genre: "Music", rating: "TV-PG" },
      { start: 60, length: 12, title: "Station Break" },
      { start: 72, length: 78, title: "Live From the Garden: Summer Sessions", genre: "Concert", rating: "TV-14" },
    ],
  },
  {
    number: 106,
    name: "Kids Corner Network",
    icon: "lucide:Smile",
    programs: [
      { start: -5, length: 55, title: "Bramble & Pip", season: 2, episode: 11, rating: "TV-Y" },
      { start: 50, length: 40, title: "Wobbly Town", rating: "TV-Y" },
      { start: 90, length: 30, title: "Cooking With Fire", rating: "TV-PG" },
      { start: 120, length: 60, title: "Movie Matinee", rating: "TV-G" },
    ],
  },
];

/** What the featured panel shows: the selected cell's program, with the badges, rating and score the panel shows. */
const FEATURED_META: Partial<GuideMeta> = { criticRating: 8.1, resolution: "4k", hdr: "HDR10", audioChannels: 6 };

/** The timeline's start for a given "now": 40 minutes before it. */
export const sampleOrigin = (nowMs: number): number => nowMs - SAMPLE_NOW_MIN * 60_000;

/** 8:41 PM today, local time: the sample's "now". */
export function sampleNow(day = new Date()): Date {
  const d = new Date(day);
  d.setHours(20, 41, 0, 0);
  return d;
}

/** The sample lineup as the guide's own channel type, with its programs placed around `nowMs`. */
export function sampleLineup(nowMs: number): GuideGridChannel[] {
  const t0 = sampleOrigin(nowMs);
  return SAMPLE_CHANNELS.map((c, i) => ({
    id: `sample-${i}`,
    number: c.number,
    name: c.name,
    callsign: null,
    icon: c.icon,
    logo: null,
    tint: null,
    package: null,
    programs: c.programs.map((p, k) => ({
      id: `sample-${i}-${k}`,
      ratingKey: null,
      startsAt: new Date(t0 + p.start * 60_000).toISOString(),
      durationSeconds: p.length * 60,
      guide: {
        title: p.title,
        showTitle: p.season != null ? p.title : undefined,
        season: p.season,
        episode: p.episode,
        year: p.year,
        contentRating: p.rating,
        genres: p.genre ? [p.genre] : undefined,
        durationMs: p.length * 60_000,
        // A path the preview never fetches: it only marks the cell as one with art, and the theme's placeholder fills it.
        art: p.art ? "sample" : undefined,
        ...(i === SAMPLE_CELL_ROW && k === 0 ? FEATURED_META : {}),
      },
    })),
  }));
}
