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
 * It builds the REAL Plex filters too. It already holds the library's full tag vocabulary,
 * so having it author the filter collapses each per-channel worker from an exploratory
 * 16-step loop into verify-and-commit. That matters enormously: a worker's preview results
 * are re-sent on every step of its loop, so exploration was costing ~117k tokens per channel.
 * The worker still owns verification — a filter that matches nothing or the wrong thing is
 * adjusted or abandoned there, so a bad proposal never becomes a broken channel.
 *
 * Channel NUMBERS are assigned here rather than by the builders: `Channel.number` is
 * `@unique` and Phase 4 fans out ~5-10 concurrent creates, so letting each agent pick
 * would race. Assigning at plan time also makes a resumed run idempotent.
 */
import type { PrismaClient } from "@ChannelGuide/db";
import { generateObject } from "ai";
import { z } from "zod";

import { ACCENT_KEYS, channelAccentAt } from "../accents";
import { getConnectionForRole, getModel } from "./config";


/**
 * The appearance vocabulary the model may choose from. Accents are a CLOSED set (the
 * 16-swatch palette — anything else is coerced to a fallback by `toAccentKey`, so an
 * invented colour silently degrades). Icons are open-ended by necessity — both sets have
 * thousands of names — so the schema documents the format and the prompt gives worked
 * examples; a bad icon name renders as a blank tile rather than breaking anything.
 */
const accentSchema = z.enum(ACCENT_KEYS);

/**
 * The predicate tree the planner emits — capped at ONE level of grouping and deliberately
 * NOT recursive.
 *
 * Two reasons it can't be the recursive `z.lazy()` shape the builder's tool input uses:
 *  1. **Structured outputs reject recursive schemas.** `generateObject` fails the request
 *     outright with "Circular reference detected in schema definitions: __schema0 ->
 *     __schema0" — before inference, so it's a hard error rather than a quality problem.
 *  2. It matches the product anyway: the admin filter-builder caps grouping at one level to
 *     mirror Plex's real UI (top-level all/any holding conditions and groups; a group holds
 *     only conditions). The resolver handles arbitrary depth, but nothing else authors it.
 */
const conditionSchema = z.object({
  type: z.literal("condition"),
  field: z.string().describe("A filterable field, e.g. genre / studio / collection / title / year / contentRating."),
  op: z.string().describe("e.g. is / isNot / contains / gte / lte."),
  value: z.string(),
});

/**
 * A group one level down: conditions only, no further nesting.
 *
 * NOTE THE FIELD NAME: groups combine with **`combinator`**, conditions compare with `op`.
 * The resolver switches on `node.combinator` and falls through to AND (intersect) when it's
 * missing — so emitting `op` on a group doesn't error, it silently turns every OR into an
 * AND. That shipped once and made `(Action OR Adventure)` resolve to films tagged BOTH.
 */
const innerGroupSchema = z.object({
  type: z.literal("group"),
  combinator: z.enum(["and", "or"]),
  children: z.array(conditionSchema).min(1),
});

/** The top level: a single condition, or a group of conditions and one-level groups. */
const filterNodeSchema = z.union([
  conditionSchema,
  z.object({
    type: z.literal("group"),
    combinator: z.enum(["and", "or"]),
    children: z.array(z.union([conditionSchema, innerGroupSchema])).min(1),
  }),
]);
const iconDescription =
  'Icon as "lucide:Name" or "phosphor:Name", PascalCase, from the lucide or phosphor icon sets. ' +
  'e.g. "lucide:Tv", "lucide:Rocket", "lucide:Ghost", "lucide:Swords", "lucide:Baby", ' +
  '"phosphor:Television", "phosphor:FilmSlate", "phosphor:PopcornBox".';

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
  callsign: z
    .string()
    .max(6)
    .optional()
    .describe("Short broadcast-style callsign, uppercase, <=6 chars. e.g. 'TOONS', 'BOND', 'KAIJU'."),
  icon: z.string().describe(iconDescription),
  mediaTypes: z
    .array(z.enum(["movie", "show"]))
    .min(1)
    .describe("Which libraries this channel draws from."),
  filter: filterNodeSchema.describe(
    "The actual Plex filter for this channel, built from the FILTER VOCABULARY you were given. This is the real thing — the builder verifies it against the library and only adjusts if the result doesn't match. Use ONLY field values that appear in the vocabulary.",
  ),
  // NO channel accent here on purpose — see `channelAccentAt` in assignNumbers below.
});

const plannedPackageSchema = z.object({
  key: z.string().describe("Stable kebab-case slug for the package."),
  name: z.string().describe("Short package name shown in the guide sidebar."),
  description: z.string(),
  icon: z.string().describe(iconDescription),
  accent: accentSchema.describe("Accent colour key for the package as a whole."),
  channels: z.array(plannedChannelSchema).min(1),
});

const planSchema = z.object({
  packages: z.array(plannedPackageSchema).min(1),
});

export type PlannedChannel = z.infer<typeof plannedChannelSchema> & {
  number: number;
  /** From the palette variance cycle, not the model — see `assignNumbers`. */
  accent: string;
};
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
- Give every channel and package a unique kebab-case \`key\`.

BUILDING THE FILTER — this is what the whole job is judged on.

A bare single-genre filter is a FAILURE. \`genre = Animation\` is not a channel, it's the entire animation library — 8,000 items with nothing in common but a tag. Anyone can write that; it's what the old rule-based generator already did. Your value is expressing an idea that a simple rule cannot.

THE SHAPE THAT WORKS — a general predicate, then curated exceptions:

  (contentRating = "TV-Y" AND genre = "Children"
     AND title notContains "Zoboomafoo"
     AND title notContains "DuckTales")
  OR title contains "Blue's Clues & You"

Read what that does: a rule broad enough to catch the right material, MINUS the specific things that match the rule but break the mood, PLUS the specific thing the rule misses. That is a curated channel. Aim for this.

RULES:
- Build from the **FILTER VOCABULARY** only — a value that isn't listed matches nothing.
- **Combine at least two dimensions.** Genre alone is almost never enough. Pair it with contentRating, year, studio, audienceRating, or collection to express the actual idea.
- **Use exclusions.** \`title\` + \`notContains\` removes the handful of items that technically match but don't belong. A channel with no exclusions usually hasn't been thought about.
- **Reach for the sharpest field available.** A \`collection\` ("James Bond") or \`studio\` ("Marvel Studios") beats a genre outright.
- **The BIGGEST SHOWS list is raw material.** For nostalgia, daypart, or mood channels, naming a handful of specific shows (title contains, OR'd) is often the only way to express the idea.
- Group syntax: \`{type:"group", combinator:"and"|"or", children:[…]}\`. Conditions use \`op\` (is / isNot / contains / notContains / gte / lte); groups use \`combinator\`. One level of nesting is allowed inside a top-level group.
- Sanity-check against \`targetPoolSize\`: 3 items can't sustain a channel, and a filter matching everything isn't a channel.

MOVIES AND TV TOGETHER:
- Real channels play both. Default \`mediaTypes\` to \`["movie","show"]\` and only narrow it when the concept genuinely demands one — a full-series marathon is shows-only; a film festival is movies-only. A kids channel, a holiday channel, a genre block: those should mix.

APPEARANCE:
- Every channel and every package needs an \`icon\`. Pick one that genuinely evokes it — a Bond channel is not a generic TV set. Icons come from the **lucide** and **phosphor** sets, written \`lucide:Name\` / \`phosphor:Name\` in PascalCase.
- Packages also need an \`accent\` from the 16 palette keys. Channels do NOT — their colours are assigned by a palette cycle that produces deliberate variance across the guide.`;

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
  // Channel accents come from the palette VARIANCE CYCLE, not the model — the same
  // mechanism the preset generator uses (`channelAccentAt`). It walks runs of 1-3
  // channels per colour, so the guide gets organic little bands instead of either a
  // rigid every-one-different rotation or long single-colour stretches. The counter runs
  // across the WHOLE lineup so the pattern carries over package boundaries too, and a
  // channel is free to differ from the package it sits in.
  let channelIndex = 0;

  return {
    packages: packages.map((pkg, pkgIndex) => {
      const numberBase = AI_NUMBER_BASE + pkgIndex * PACKAGE_BLOCK_SIZE;
      return {
        ...pkg,
        numberBase,
        channels: pkg.channels.map((channel, i) => ({
          ...channel,
          number: numberBase + i + 1,
          accent: channelAccentAt(channelIndex++),
        })),
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
  /**
   * The rendered library profile PLUS the full filter vocabulary — the planner needs the real
   * tag values to author filters, not just the statistical shape.
   */
  libraryContext: string,
  opts: PlanOptions = {},
): Promise<LineupPlan> {
  // The PLANNER role: one big reasoning call where quality matters most. Falls back to the
  // active (chat) connection when no dedicated planner is configured.
  const connection = await getConnectionForRole(prisma, "planner");
  if (!connection) {
    throw new Error("No active AI connection — configure one in Settings → AI Assistant.");
  }

  // `limit` bounds GENERATION, not just the result. Trimming afterwards (as this used to do)
  // meant every test run paid for a full ~50-channel structured output on the planner model —
  // the most expensive artifact in the run — and then threw 90% of it away.
  const target = opts.limit ?? opts.targetChannels ?? DEFAULT_TARGET_CHANNELS;
  const packages = target <= 8 ? 1 : Math.max(6, Math.min(10, Math.round(target / 6)));

  const { object, usage } = await generateObject({
    model: getModel(connection),
    schema: planSchema,
    system: SYSTEM,
    prompt: [
      libraryContext,
      "",
      `Propose exactly ${target} channels across ${packages} package${packages === 1 ? "" : "s"}.`,
      "Give every channel a complete, working filter built from the vocabulary above.",
    ].join("\n"),
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  });

  console.log(
    `[plan] tokens in=${usage?.inputTokens ?? 0} out=${usage?.outputTokens ?? 0}` +
      ` cacheRead=${usage?.inputTokenDetails?.cacheReadTokens ?? 0}` +
      ` cacheWrite=${usage?.inputTokenDetails?.cacheWriteTokens ?? 0}`,
  );

  // Numbers are assigned AFTER generation — the model shouldn't be trusted with a
  // uniqueness constraint, and this keeps the block layout deterministic. `applyLimit` is
  // now just a backstop for a model that overshoots the requested count.
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
