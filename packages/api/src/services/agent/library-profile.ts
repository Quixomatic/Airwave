/**
 * The library profile (§7.3a §4.1) — the compact "map" the planning model reasons over.
 *
 * The model can't see thousands of items, so we distill the whole library into a few KB:
 * what genres exist and how much of each, which studios/networks dominate, the era
 * spread, the content-rating mix, and which shows have enough episodes to carry a
 * channel. That's what lets the planner propose channels grounded in what's ACTUALLY
 * there rather than generic "90s Sitcoms" guesses.
 *
 * All of it comes from the local `MediaItem` cache — no Plex round-trips — so it's cheap
 * enough to run at the head of every build.
 *
 * WHY RAW SQL: genres live inside the `guide` JSONB bundle, not a column, so counting
 * them in JS would mean pulling every row into memory (100k+ episodes on a big library).
 * `jsonb_array_elements_text` does it in one aggregate query instead.
 *
 * INHERITANCE: an episode's own guide carries only episode-level fields — genres, studio
 * and content rating live on its PARENT show ([[project-media-metadata-cache]]). So the
 * dimension queries deliberately count MOVIES AND SHOWS ONLY, never episodes: counting
 * episodes would both miss the metadata and let one 500-episode show drown out everything
 * else. Episode counts are surfaced separately via `topShows`.
 */
import type { PrismaClient } from "@ChannelGuide/db";

export type NamedCount = { name: string; count: number };

export type LibraryProfile = {
  sourceId: string;
  totals: { movies: number; shows: number; episodes: number };
  genres: NamedCount[];
  studios: NamedCount[];
  contentRatings: NamedCount[];
  decades: { decade: number; count: number }[];
  /** Shows with enough episodes to sustain a channel, biggest first. */
  topShows: { title: string; episodes: number }[];
};

/** Keep the profile small enough to sit comfortably in a cached prompt prefix. */
const LIMITS = { genres: 40, studios: 30, contentRatings: 15, decades: 12, topShows: 40 } as const;

/** Shows below this are too thin to headline a channel; they still count toward genres. */
const MIN_EPISODES_FOR_TOP_SHOW = 5;

type CountRow = { name: string | null; count: bigint | number };

const toCounts = (rows: CountRow[]): NamedCount[] =>
  rows
    .filter((r): r is { name: string; count: bigint | number } => !!r.name && r.name.trim() !== "")
    .map((r) => ({ name: r.name, count: Number(r.count) }));

export async function buildLibraryProfile(
  prisma: PrismaClient,
  sourceId: string,
): Promise<LibraryProfile> {
  const [typeCounts, genres, studios, contentRatings, decades, topShows] = await Promise.all([
    prisma.mediaItem.groupBy({
      by: ["type"],
      where: { mediaSourceId: sourceId, available: true },
      _count: true,
    }),

    // Genres are a JSONB string[]; unnest and count. Movies + shows only (see header).
    prisma.$queryRaw<CountRow[]>`
      SELECT g.value AS name, COUNT(*)::int AS count
      FROM media_item mi,
           LATERAL jsonb_array_elements_text(mi.guide -> 'genres') g
      WHERE mi."mediaSourceId" = ${sourceId}
        AND mi.available = TRUE
        AND mi.type IN ('movie', 'show')
        AND jsonb_typeof(mi.guide -> 'genres') = 'array'
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT ${LIMITS.genres}
    `,

    prisma.$queryRaw<CountRow[]>`
      SELECT mi.guide ->> 'studio' AS name, COUNT(*)::int AS count
      FROM media_item mi
      WHERE mi."mediaSourceId" = ${sourceId}
        AND mi.available = TRUE
        AND mi.type IN ('movie', 'show')
        AND mi.guide ->> 'studio' IS NOT NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT ${LIMITS.studios}
    `,

    prisma.$queryRaw<CountRow[]>`
      SELECT mi.guide ->> 'contentRating' AS name, COUNT(*)::int AS count
      FROM media_item mi
      WHERE mi."mediaSourceId" = ${sourceId}
        AND mi.available = TRUE
        AND mi.type IN ('movie', 'show')
        AND mi.guide ->> 'contentRating' IS NOT NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT ${LIMITS.contentRatings}
    `,

    // `year` is a real column, so this one needs no JSON digging.
    prisma.$queryRaw<{ decade: number | null; count: bigint | number }[]>`
      SELECT (mi.year / 10) * 10 AS decade, COUNT(*)::int AS count
      FROM media_item mi
      WHERE mi."mediaSourceId" = ${sourceId}
        AND mi.available = TRUE
        AND mi.type IN ('movie', 'show')
        AND mi.year IS NOT NULL
      GROUP BY 1
      ORDER BY 1 DESC
      LIMIT ${LIMITS.decades}
    `,

    // Episode counts per show, via the parent self-relation.
    prisma.$queryRaw<{ name: string | null; count: bigint | number }[]>`
      SELECT parent.title AS name, COUNT(*)::int AS count
      FROM media_item ep
      JOIN media_item parent ON parent.id = ep."parentId"
      WHERE ep."mediaSourceId" = ${sourceId}
        AND ep.available = TRUE
        AND ep.type = 'episode'
      GROUP BY 1
      HAVING COUNT(*) >= ${MIN_EPISODES_FOR_TOP_SHOW}
      ORDER BY 2 DESC
      LIMIT ${LIMITS.topShows}
    `,
  ]);

  const byType = Object.fromEntries(typeCounts.map((c) => [c.type, c._count])) as Record<string, number>;

  return {
    sourceId,
    totals: {
      movies: byType.movie ?? 0,
      shows: byType.show ?? 0,
      episodes: byType.episode ?? 0,
    },
    genres: toCounts(genres),
    studios: toCounts(studios),
    contentRatings: toCounts(contentRatings),
    decades: decades
      .filter((d): d is { decade: number; count: bigint | number } => d.decade != null)
      .map((d) => ({ decade: Number(d.decade), count: Number(d.count) })),
    topShows: toCounts(topShows).map((s) => ({ title: s.name, episodes: s.count })),
  };
}

/**
 * Render the profile as compact text for the planning prompt. Deliberately terse —
 * this sits in a cached prefix that every per-channel agent shares, so every token
 * is paid for many times over.
 */
export function formatLibraryProfile(profile: LibraryProfile): string {
  const list = (items: NamedCount[]) => items.map((i) => `${i.name} (${i.count})`).join(", ");
  return [
    `LIBRARY: ${profile.totals.movies} movies, ${profile.totals.shows} shows, ${profile.totals.episodes} episodes.`,
    `GENRES: ${list(profile.genres) || "none recorded"}`,
    `STUDIOS/NETWORKS: ${list(profile.studios) || "none recorded"}`,
    `CONTENT RATINGS: ${list(profile.contentRatings) || "none recorded"}`,
    `DECADES: ${profile.decades.map((d) => `${d.decade}s (${d.count})`).join(", ") || "none recorded"}`,
    `BIGGEST SHOWS: ${profile.topShows.map((s) => `${s.title} (${s.episodes} eps)`).join(", ") || "none"}`,
  ].join("\n");
}
