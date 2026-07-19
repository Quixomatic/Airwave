/**
 * The lineup planner (§7.3a §4.2) — turns a {@link LibraryProfile} into a full proposed
 * lineup: themed packages, each holding channel concepts.
 *
 * This is the step that justifies the whole arc. The static generator evaluates 184
 * hardcoded presets, so it can only ever build channels somebody anticipated. This
 * looks at what's ACTUALLY on the server and proposes channels for it — the
 * "Saturday Morning 1997" or "Toddler Wind-Down" that no preset author would have
 * guessed this particular library could fill.
 *
 * It deliberately does NOT build Plex filters. The model proposes a *concept* (a name and
 * a plain-language theme); Phase 4's per-channel agent grounds that into a real filter
 * using `discover_field_values` + `preview_filter` and verifies the pool before creating
 * anything. Splitting it that way keeps this call cheap (one pass over a ~630-token
 * profile) and means a concept that can't be filled is discarded at build time rather
 * than producing a broken channel.
 *
 * Channel NUMBERS are assigned here rather than by the builders: `Channel.number` is
 * `@unique` and Phase 4 fans out ~5-10 concurrent creates, so letting each agent pick
 * would race. Assigning at plan time also makes a resumed run idempotent.
 */
import type { PrismaClient } from "@ChannelGuide/db";
import { generateObject } from "ai";
import { z } from "zod";

import { getActiveConnection, getModel } from "./config";
import { type LibraryProfile, formatLibraryProfile } from "./library-profile";

/** AI channels live at 1001+, leaving 1-999 to presets/manual channels. */
export const AI_NUMBER_BASE = 1000;
/** Each package gets its own hundred-block: 1001-1099, 1101-1199, … */
export const PACKAGE_BLOCK_SIZE = 100;

const plannedChannelSchema = z.object({
  key: z
    .string()
    .describe("Stable kebab-case slug, unique across the whole lineup. e.g. 'saturday-morning-1997'"),
  name: z.string().describe("Short on-screen channel name. e.g. 'Saturday Morning '97'"),
  description: z.string().describe("One sentence a viewer would read in the guide."),
  theme: z
    .string()
    .describe(
      "Plain-language description of EXACTLY what belongs on this channel, written for the agent that will build the Plex filter. Name concrete shows/movies/genres/studios/years from the library where you can — this is the grounding it works from.",
    ),
  targetPoolSize: z
    .number()
    .int()
    .describe("Roughly how many items you expect to match. Used to sanity-check the built filter."),
  sortField: z.string().optional().describe("Plex sort field, e.g. 'title', 'year', 'originallyAvailableAt'."),
  sortDir: z.enum(["asc", "desc"]).optional(),
  ordering: z
    .enum(["SHUFFLE", "IN_ORDER", "BY_AIR_DATE"])
    .describe("SHUFFLE for most channels; IN_ORDER/BY_AIR_DATE for a channel meant to be watched in sequence."),
});

const plannedPackageSchema = z.object({
  key: z.string().describe("Stable kebab-case slug for the package."),
  name: z.string().describe("Short package name shown in the guide sidebar."),
  description: z.string(),
  channels: z.array(plannedChannelSchema).min(1),
});

const planSchema = z.object({
  packages: z.array(plannedPackageSchema).min(1),
});

export type PlannedChannel = z.infer<typeof plannedChannelSchema> & { number: number };
export type PlannedPackage = Omit<z.infer<typeof plannedPackageSchema>, "channels"> & {
  numberBase: number;
  channels: PlannedChannel[];
};
export type LineupPlan = { packages: PlannedPackage[] };

const SYSTEM = `You are a television programmer building a personal live-TV lineup out of someone's own media library.

Your job is to propose a lineup of CHANNELS grouped into PACKAGES, based on a statistical profile of what is actually in their library.

WHAT MAKES A GOOD LINEUP:
- **Be ambitious and imaginative.** The obvious channels (one per genre) are the boring ones. The interesting channels are cross-cutting concepts that only make sense for THIS library: a nostalgic block built from the specific cartoons they own, a director or franchise marathon, a "comfort watch" channel, a late-night block, a channel for a specific mood or time of day.
- **Ground every idea in the profile.** Only propose a channel you can see the material for. If you name a franchise, era, studio or show, it must appear in the profile. Never invent content.
- **Vary the shape.** Mix broad always-on channels (big episode counts, high rewatch) with narrow specialty channels. Mix movies and TV. Mix eras.
- **Respect the audience signal.** The profile tells you who watches: a big preschool/kids presence means real kids channels; a big anime presence means anime channels; heavy prestige TV means a drama block.
- **Channels can be turned off later**, so favour interesting ideas over safe ones. A channel that turns out thin is cheap; a boring lineup is not.

CONSTRAINTS:
- Genre/studio names in the profile are Plex's OWN tag vocabulary, warts and all. It mixes movie-style and TV-style tags ("Science Fiction" vs "Sci-Fi & Fantasy", "Action/Adventure"), and things like anime are often tagged only "Animation". Work with the tags as they actually are.
- A show's episode count tells you how much runtime it can sustain. A channel built on one 20-episode show will repeat constantly; one built on 500+ episodes can run forever.
- Do NOT write Plex filter syntax. Describe the intent in \`theme\` — a later agent builds and verifies the actual filter.
- Give every channel and package a unique kebab-case \`key\`.`;

export type PlanOptions = {
  /** Rough number of channels to aim for across the whole lineup. */
  targetChannels?: number;
  /** Hard cap for testing — trims the plan after generation. */
  limit?: number;
};

const DEFAULT_TARGET_CHANNELS = 50;

/**
 * Assign channel numbers: package N owns the block starting at 1000 + (N+1)*100 … so
 * package 0 -> 1001+, package 1 -> 1101+. Keeps a package's channels contiguous in the
 * guide with headroom to add more later without renumbering.
 */
function assignNumbers(packages: z.infer<typeof planSchema>["packages"]): LineupPlan {
  return {
    packages: packages.map((pkg, pkgIndex) => {
      const numberBase = AI_NUMBER_BASE + pkgIndex * PACKAGE_BLOCK_SIZE;
      return {
        ...pkg,
        numberBase,
        channels: pkg.channels.map((channel, i) => ({ ...channel, number: numberBase + i + 1 })),
      };
    }),
  };
}

/** Drop channels beyond `limit`, then any package left empty. Used for scoped test runs. */
function applyLimit(plan: LineupPlan, limit?: number): LineupPlan {
  if (!limit) return plan;
  let remaining = limit;
  const packages: PlannedPackage[] = [];
  for (const pkg of plan.packages) {
    if (remaining <= 0) break;
    const channels = pkg.channels.slice(0, remaining);
    remaining -= channels.length;
    if (channels.length) packages.push({ ...pkg, channels });
  }
  return { packages };
}

export async function planLineup(
  prisma: PrismaClient,
  profile: LibraryProfile,
  opts: PlanOptions = {},
): Promise<LineupPlan> {
  const connection = await getActiveConnection(prisma);
  if (!connection) {
    throw new Error("No active AI connection — configure one in Settings → AI Assistant.");
  }

  const target = opts.targetChannels ?? DEFAULT_TARGET_CHANNELS;

  const { object } = await generateObject({
    model: getModel(connection),
    schema: planSchema,
    system: SYSTEM,
    prompt: [
      formatLibraryProfile(profile),
      "",
      `Propose roughly ${target} channels across 6-10 packages.`,
      "Return the full lineup.",
    ].join("\n"),
  });

  // Numbers are assigned AFTER generation — the model shouldn't be trusted with a
  // uniqueness constraint, and this keeps the block layout deterministic.
  return applyLimit(assignNumbers(object.packages), opts.limit);
}

/** Compact one-line-per-channel rendering, for logs and the run report. */
export function formatLineupPlan(plan: LineupPlan): string {
  return plan.packages
    .map((pkg) => {
      const head = `${pkg.name} [${pkg.key}] — ${pkg.channels.length} channels (${pkg.numberBase + 1}+)`;
      const rows = pkg.channels.map((c) => `  ${c.number}  ${c.name} — ${c.description}`);
      return [head, ...rows].join("\n");
    })
    .join("\n\n");
}
