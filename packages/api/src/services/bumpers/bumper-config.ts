import type { PrismaClient } from "@ChannelGuide/db";

/**
 * The break plan the schedule engine weaves in (null = no bumpers on this channel).
 * Interstitial length is **contextual** — chosen per program transition by
 * {@link breakSeconds} — so these are the configurable tiers, not one fixed value.
 */
export type BumperPlan = {
  /** Fallback length when no specific tier applies. */
  defaultSeconds: number;
  /** After a movie — a real intermission. */
  afterMovieSeconds: number;
  /** After a TV episode — a normal breather. */
  afterEpisodeSeconds: number;
  /** Same show continues, or a short episode is up next. */
  quickSeconds: number;
  /** Episodes at/under this many minutes count as "short". */
  shortEpisodeMinutes: number;
  /** The config rev this plan was built from (stamped on the channel). */
  rev: number;
};

/** Minimal shape needed to classify a program for break timing. */
export type ClassifyItem = {
  durationMs: number;
  guide: { type?: string; showRatingKey?: string };
};

const SINGLETON_KEY = "global";

/**
 * The global bumper config is a singleton row (key = "global"). Get-or-create so
 * callers always get a row to read/update.
 */
export async function getGlobalBumperConfig(prisma: PrismaClient) {
  return prisma.bumperConfig.upsert({
    where: { key: SINGLETON_KEY },
    create: { key: SINGLETON_KEY },
    update: {},
  });
}

type ChannelBumperFields = { bumperMode: string };

type GlobalBumperFields = {
  enabled: boolean;
  interstitialSeconds: number;
  afterMovieSeconds: number;
  afterEpisodeSeconds: number;
  quickSeconds: number;
  shortEpisodeMinutes: number;
  rev: number;
};

/**
 * The effective break plan for a channel: bumpers apply only when the global config
 * is enabled AND the channel's mode isn't OFF. INHERIT / INTERSTITIAL_ONLY / FULL
 * all resolve to the interstitial for now (commercials-within is a later layer).
 */
export function resolveBumperPlan(
  global: GlobalBumperFields,
  channel: ChannelBumperFields,
): BumperPlan | null {
  if (!global.enabled) return null;
  if (channel.bumperMode === "OFF") return null;
  return {
    defaultSeconds: Math.max(1, global.interstitialSeconds),
    afterMovieSeconds: Math.max(1, global.afterMovieSeconds),
    afterEpisodeSeconds: Math.max(1, global.afterEpisodeSeconds),
    quickSeconds: Math.max(1, global.quickSeconds),
    shortEpisodeMinutes: Math.max(0, global.shortEpisodeMinutes),
    rev: global.rev,
  };
}

/**
 * Length (seconds) of the break between `prev` (just ended) and `next` (up next).
 * First matching rule wins, most specific → most general:
 *   1. same show continues (episode → episode, same show)      → quick
 *   2. after a movie (feature just ended)                       → afterMovie
 *   3. a short episode is up next                               → quick
 *   4. after a TV episode                                       → afterEpisode
 *   5. otherwise                                                → default
 */
export function breakSeconds(prev: ClassifyItem, next: ClassifyItem, plan: BumperPlan): number {
  const prevType = prev.guide.type;
  const nextType = next.guide.type;
  const prevIsEpisode = prevType === "episode";
  const nextIsEpisode = nextType === "episode";
  // A movie by type, or (when type is missing) a long non-episode.
  const prevIsMovie =
    prevType === "movie" || (prevType !== "episode" && prev.durationMs >= 75 * 60 * 1000);

  const sameShow =
    prevIsEpisode &&
    nextIsEpisode &&
    !!prev.guide.showRatingKey &&
    prev.guide.showRatingKey === next.guide.showRatingKey;
  const nextIsShortEpisode =
    nextIsEpisode && next.durationMs <= plan.shortEpisodeMinutes * 60 * 1000;

  if (sameShow) return plan.quickSeconds;
  if (prevIsMovie) return plan.afterMovieSeconds;
  if (nextIsShortEpisode) return plan.quickSeconds;
  if (prevIsEpisode) return plan.afterEpisodeSeconds;
  return plan.defaultSeconds;
}

/** Load the global config and resolve the plan for a single channel in one call. */
export async function channelBumperPlan(
  prisma: PrismaClient,
  channel: ChannelBumperFields,
): Promise<BumperPlan | null> {
  const global = await getGlobalBumperConfig(prisma);
  return resolveBumperPlan(global, channel);
}
