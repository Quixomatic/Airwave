import type { PrismaClient } from "@ChannelGuide/db";

/** The break plan the schedule engine weaves in. Null = no bumpers on this channel. */
export type BumperPlan = {
  /** Interstitial break length, in seconds. */
  interstitialSeconds: number;
  /** Reserved for future template variants; one style for now. */
  style: string;
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

/**
 * The effective break plan for a channel: bumpers apply only when the global config
 * is enabled AND the channel's mode isn't OFF. INHERIT / INTERSTITIAL_ONLY / FULL
 * all resolve to the interstitial for now (commercials-within is a later layer).
 */
export function resolveBumperPlan(
  global: { enabled: boolean; interstitialSeconds: number; interstitialStyle: string },
  channel: ChannelBumperFields,
): BumperPlan | null {
  if (!global.enabled) return null;
  if (channel.bumperMode === "OFF") return null;
  return {
    interstitialSeconds: Math.max(1, global.interstitialSeconds),
    style: global.interstitialStyle,
  };
}

/** Load the global config and resolve the plan for a single channel in one call. */
export async function channelBumperPlan(
  prisma: PrismaClient,
  channel: ChannelBumperFields,
): Promise<BumperPlan | null> {
  const global = await getGlobalBumperConfig(prisma);
  return resolveBumperPlan(global, channel);
}
