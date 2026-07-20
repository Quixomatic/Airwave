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
import { fieldMeta, OPS_FOR_KIND } from "../plex/filter-fields";
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
  field: z.string().describe("A filterable field, e.g. genre / studio / title / year / decade / contentRating / audienceRating / duration."),
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
  existingKey: z
    .string()
    .optional()
    .describe(
      "Set this to the `key` of an EXISTING package to file these channels into it instead of creating a new one. Leave unset to create a new package. When set, the existing package keeps its own name/description/icon/accent — the ones you give here are ignored.",
    ),
  name: z.string().describe("Short package name shown in the guide sidebar."),
  description: z.string(),
  icon: z.string().describe(iconDescription),
  accent: accentSchema.describe("Accent colour key for the package as a whole."),
  channels: z.array(plannedChannelSchema).min(1),
});

const planSchema = z.object({
  packages: z.array(plannedPackageSchema).min(1),
});

/**
 * A channel as the model emits it — no number yet.
 *
 * Numbering used to happen here, at plan time. It can't any more: a number now depends on
 * which hundred-block its package owns, and for a REUSED package that's only knowable by
 * reading the database *after* the previous AI lineup has been wiped. Assigning before the
 * wipe would allocate against numbers that are about to be freed.
 */
export type PlannedChannelDraft = z.infer<typeof plannedChannelSchema>;

export type PlannedChannel = PlannedChannelDraft & {
  number: number;
  /** From the palette variance cycle, not the model — see `assignChannelNumbers`. */
  accent: string;
};

export type PlannedPackageDraft = Omit<z.infer<typeof plannedPackageSchema>, "channels"> & {
  channels: PlannedChannelDraft[];
};
export type PlannedPackage = Omit<z.infer<typeof plannedPackageSchema>, "channels"> & {
  numberBase: number;
  channels: PlannedChannel[];
};

/** What the planner returns: the full lineup, not yet numbered. */
export type LineupPlanDraft = { packages: PlannedPackageDraft[] };
/** The same lineup after {@link assignChannelNumbers} has resolved every number. */
export type LineupPlan = { packages: PlannedPackage[] };

/** One existing package, offered to the planner as a possible home for new channels. */
export type ExistingPackage = {
  key: string;
  name: string;
  description: string | null;
  /** "ai" | "preset" | "manual" — provenance matters: an AI package is about to be wiped. */
  origin: "ai" | "preset" | "manual";
  channelCount: number;
};

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
- Write BOTH: \`theme\` describes the intent in plain language (it becomes the brief for the agent that verifies your work), and \`filter\` is the real Plex filter you author for it. They are not alternatives — a channel needs both.
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
- **Tag values must come from the FILTER VOCABULARY** — for a tag field (genre, studio, network, contentRating, collection, country, resolution, label) a value that isn't listed matches nothing. This constrains VALUES, not which FIELDS you may use: numeric, date and boolean fields have no value list and are filtered by range or true/false.
- **Combine at least two dimensions.** Genre alone is almost never enough. Pair it with contentRating, year, studio, audienceRating, or collection to express the actual idea.
- **Use exclusions.** \`title\` + \`notContains\` removes the handful of items that technically match but don't belong. A channel with no exclusions usually hasn't been thought about.
- **Reach for the sharpest field available.** A \`studio\` ("Marvel Studios") or a specific set of titles beats a broad genre outright.
- **\`collection\` is a LAST RESORT.** This library's collections were assembled years ago and have not been maintained, so they are stale and incomplete — a collection that sounds perfect for a channel is probably missing most of what should be in it. Prefer studio, title sets, or the numeric fields. Only use a collection when nothing else can express the idea, and never build a channel's whole identity on one.
- **The BIGGEST SHOWS list is raw material.** For nostalgia, daypart, or mood channels, naming a handful of specific shows (title contains, OR'd) is often the only way to express the idea.
- Group syntax: \`{type:"group", combinator:"and"|"or", children:[…]}\`. Conditions use \`op\` (is / isNot / contains / notContains / gte / lte); groups use \`combinator\`. One level of nesting is allowed inside a top-level group.
- **\`label\` values are HAND-APPLIED by the library's owner** — they are the most reliable signal you have. If shows are labelled "Anime", that label defines what the owner considers anime; use it directly and never second-guess it.
- **The NUMERIC fields are where the best channels come from.** Tag intersection alone gives you genre blocks anyone could write. \`audienceRating\`, \`criticRating\`, \`duration\`, \`decade\`, \`year\`, \`addedWithin\`, \`unwatched\`, \`hdr\` and \`userRating\` are what turn a genre into a channel with a point of view. Use the NUMERIC SPREADS above to pick thresholds that actually divide this library.
- **Prefer a WINDOW to a floor.** \`audienceRating gte 7\` selects a third of the library and overlaps everything else. A window — \`gte 7\` AND \`lte 8\` — carves out a distinct, nameable channel ("the good-not-great pile"). Deliberately going LOW is also a channel: an unrated or sub-median block is where the schlock lives, and that is the entire point of some channels.
- **Runtime is programming intent, not trivia.** Under ~20 minutes is a quick-bite channel; 60-100 is a matinee; 150+ is an event. \`duration\` is MOVIES ONLY.
- **Watch the type restrictions.** The catalog marks fields as movie-only or show-only. A condition on a field the channel's \`mediaTypes\` doesn't cover is dropped before it ever runs, so either narrow \`mediaTypes\` or pick a field that applies to both.
- **Judge size by RUNTIME, not item count.** A channel built on three shows with 200 episodes each has 600 episodes — weeks of programming, and a perfectly good channel. \`targetPoolSize\` is a loose hint; a small number of big shows is a strength, not a problem. Don't avoid a good channel concept because few *titles* match it.

COVERAGE — how many channels, and which:
- **There is no target number.** Build as many channels and packages as this library actually warrants. A large, varied library might need a hundred or more; a small focused one might need twenty. Let the library decide.
- **The test is reachability:** could someone find a decent home for the vast majority of what's on this server by browsing your lineup? Walk the profile — the genres, the studios, the decades, the biggest shows — and make sure each meaningful block is served by something. A big chunk of the library that no channel would ever play is a gap; name a channel for it.
- **Depth where there's depth.** A genre with 300 titles or a show with 500 episodes can support several distinct channels (by era, by mood, by sub-genre, by rating). One catch-all channel over that much material wastes it.
- **Don't pad.** Two channels that would resolve to nearly the same pool should be one channel. Every channel must justify its own existence with a concept a viewer could describe in a sentence.
- **Packages group channels the way a viewer thinks** — by audience, mood, or occasion. Use as many as the lineup needs; don't force channels into a package where they don't belong.
- **REUSE AN EXISTING PACKAGE WHEN ONE FITS.** You are shown the packages already on this server. If a channel belongs in one of them, set that package's \`existingKey\` rather than inventing a near-duplicate — a lineup with "Kids & Family" *and* a new "Family Fun" is worse for the viewer than one good package. Reuse is the default when a reasonable home exists; create a new package only for a genuinely new idea the current set doesn't cover. Note the \`origin\`: an \`ai\` package is from a previous run of this same process and will be replaced, so prefer reusing \`preset\` and \`manual\` packages, which are the owner's own organisation.

MOVIES AND TV TOGETHER:
- Real channels play both. Default \`mediaTypes\` to \`["movie","show"]\` and only narrow it when the concept genuinely demands one — a full-series marathon is shows-only; a film festival is movies-only. A kids channel, a holiday channel, a genre block: those should mix.

APPEARANCE:
- Every channel and every package needs an \`icon\`. Pick one that genuinely evokes it — a Bond channel is not a generic TV set. Icons come from the **lucide** and **phosphor** sets, written \`lucide:Name\` / \`phosphor:Name\` in PascalCase.
- Packages also need an \`accent\` from the 16 palette keys. Channels do NOT — their colours are assigned by a palette cycle that produces deliberate variance across the guide.`;

export type PlanOptions = {
  /**
   * Force an exact channel count. Leave unset for the real behaviour — the model sizes the
   * lineup to the library. Only set this if you specifically need a fixed-size lineup.
   */
  targetChannels?: number;
};

/**
 * Assign every channel a number, AFTER the previous AI lineup has been wiped and packages
 * resolved. Must run as its own durable step for two reasons: it reads live database state
 * (so it can't run before the wipe frees the old numbers), and its result is persisted, so a
 * resumed run reuses the identical numbering rather than re-deriving it against a database
 * that has since changed.
 *
 * THE RULE: every package in the lineup owns its own hundred-block at 1000+, whether it's
 * newly created or an existing one being reused. A package whose channels live at 1-999 (a
 * preset or hand-made package) gets a fresh block carved out for its AI channels — so those
 * channels stay contiguous in the guide even though the package's originals sit elsewhere.
 * A package that already owns a 1000+ block keeps it and fills the gaps.
 */
export async function assignChannelNumbers(
  prisma: PrismaClient,
  draft: LineupPlanDraft,
  packageIdByKey: Record<string, string>,
): Promise<LineupPlan> {
  const existing = await prisma.channel.findMany({ select: { number: true, packageId: true } });

  // Every number currently spoken for — manual channels, preset channels, and any AI
  // channel that survived the wipe. Never reuse one.
  const taken = new Set(existing.map((c) => c.number));

  // Which 1000+ block each package already occupies, if any. First one wins: a package
  // whose channels somehow straddle blocks keeps its lowest.
  const blockByPackageId = new Map<string, number>();
  for (const c of existing) {
    if (!c.packageId || c.number < AI_NUMBER_BASE) continue;
    const block = Math.floor(c.number / PACKAGE_BLOCK_SIZE) * PACKAGE_BLOCK_SIZE;
    const current = blockByPackageId.get(c.packageId);
    if (current == null || block < current) blockByPackageId.set(c.packageId, block);
  }

  const usedBlocks = new Set(blockByPackageId.values());
  const claimFreeBlock = () => {
    let b = AI_NUMBER_BASE;
    while (usedBlocks.has(b)) b += PACKAGE_BLOCK_SIZE;
    usedBlocks.add(b);
    return b;
  };

  // Channel accents come from the palette VARIANCE CYCLE, not the model — the same
  // mechanism the preset generator uses (`channelAccentAt`). It walks runs of 1-3
  // channels per colour, so the guide gets organic little bands instead of either a
  // rigid every-one-different rotation or long single-colour stretches. The counter runs
  // across the WHOLE lineup so the pattern carries over package boundaries too.
  let channelIndex = 0;

  const packages = draft.packages.map((pkg) => {
    const packageId = packageIdByKey[pkg.key];
    let block = packageId ? blockByPackageId.get(packageId) : undefined;
    if (block == null) {
      block = claimFreeBlock();
      if (packageId) blockByPackageId.set(packageId, block);
    }
    const firstBlock = block;
    let cursor = block + 1;

    const channels = pkg.channels.map((channel) => {
      // Walk to the next free slot, spilling into a fresh block if this one fills up.
      // A package with more than ~99 channels is unlikely but must not wedge or collide.
      for (;;) {
        if (cursor >= block! + PACKAGE_BLOCK_SIZE) {
          block = claimFreeBlock();
          cursor = block + 1;
          continue;
        }
        if (taken.has(cursor)) {
          cursor++;
          continue;
        }
        break;
      }
      taken.add(cursor);
      return { ...channel, number: cursor++, accent: channelAccentAt(channelIndex++) };
    });

    return { ...pkg, numberBase: firstBlock, channels };
  });

  return { packages };
}

// (There used to be an `applyLimit` here that trimmed the plan. It's gone: the planner now
// always emits the full lineup, and any testing cap is applied to the BUILD fan-out in the
// workflow — see `sampleAcrossPackages`.)

type LooseNode = { type?: string; field?: string; op?: string; children?: LooseNode[] };

/**
 * Drop conditions the filter engine can't honour, BEFORE the build fans out.
 *
 * Widening the planner's field catalog means more ways to be wrong: an invented field, an
 * operator that doesn't belong to the field's kind, or — the likely one — a type-restricted
 * field on a channel that carries both media types. `duration` is `appliesTo: ["movie"]` and
 * `network` is shows-only, while channels now default to `["movie","show"]`, so that
 * combination is a natural mistake rather than an exotic one.
 *
 * Repairing here is deliberate: the worker WOULD eventually catch a bad filter via preview,
 * but only after spending agent steps on it, and a silently-ignored condition can also
 * resolve to a plausible-looking pool that nobody questions. A deterministic check costs
 * nothing and turns a quiet wrong answer into a logged one.
 */
function sanitizeFilter(
  node: LooseNode | undefined,
  mediaTypes: string[],
  warn: (msg: string) => void,
): LooseNode | undefined {
  if (!node) return undefined;

  if (node.type === "group") {
    const children = (node.children ?? [])
      .map((c) => sanitizeFilter(c, mediaTypes, warn))
      .filter((c): c is LooseNode => !!c);
    // A group emptied by sanitizing must not survive: an empty AND/OR resolves to
    // "everything", which is the opposite of what the dropped condition intended.
    if (!children.length) return undefined;
    return { ...node, children };
  }

  const meta = fieldMeta(node.field ?? "");
  if (!meta) {
    warn(`unknown field "${node.field}" — condition dropped`);
    return undefined;
  }
  if (node.op && !OPS_FOR_KIND[meta.kind].includes(node.op as never)) {
    warn(`operator "${node.op}" is not valid for ${meta.field} (${meta.kind}) — condition dropped`);
    return undefined;
  }
  if (meta.appliesTo && !mediaTypes.every((t) => meta.appliesTo!.includes(t as never))) {
    warn(
      `field "${meta.field}" applies to ${meta.appliesTo.join("+")} only but the channel carries ${mediaTypes.join("+")} — condition dropped`,
    );
    return undefined;
  }
  return node;
}

/** Run every planned channel's filter through {@link sanitizeFilter}, logging what changed. */
function sanitizePlan(packages: z.infer<typeof planSchema>["packages"]) {
  let dropped = 0;
  for (const pkg of packages) {
    for (const channel of pkg.channels) {
      const cleaned = sanitizeFilter(channel.filter as LooseNode, channel.mediaTypes, (msg) => {
        dropped++;
        console.warn(`[plan] ${channel.name}: ${msg}`);
      });
      channel.filter = cleaned as typeof channel.filter;
    }
  }
  if (dropped) console.warn(`[plan] sanitized ${dropped} invalid condition(s) before build`);
  return packages;
}

/**
 * The packages that already exist, offered to the planner as possible homes for new channels.
 *
 * Deliberately NOT folded into `libraryContext`: that string is the byte-identical cached
 * prefix every per-channel worker shares, and a worker has no use for the package list. Only
 * the planner decides where a channel lives.
 */
export function formatExistingPackages(packages: ExistingPackage[]): string {
  if (!packages.length) return "(none — this is the first lineup, create packages as needed)";
  return packages
    .map(
      (p) =>
        `${p.key} — "${p.name}" (${p.origin}, ${p.channelCount} channel${p.channelCount === 1 ? "" : "s"})${p.description ? `: ${p.description}` : ""}`,
    )
    .join("\n");
}

export async function planLineup(
  prisma: PrismaClient,
  /**
   * The rendered library profile PLUS the full filter vocabulary — the planner needs the real
   * tag values to author filters, not just the statistical shape.
   */
  libraryContext: string,
  opts: PlanOptions & { existingPackages?: ExistingPackage[] } = {},
): Promise<LineupPlanDraft> {
  // The PLANNER role: one big reasoning call where quality matters most. Falls back to the
  // active (chat) connection when no dedicated planner is configured.
  const connection = await getConnectionForRole(prisma, "planner");
  if (!connection) {
    throw new Error("No active AI connection — configure one in Settings → AI Assistant.");
  }

  /**
   * The planner ALWAYS produces the full lineup — a quota is the wrong instruction for a
   * coverage goal (too high and it pads with near-duplicates, too low and parts of the
   * library have nowhere to live). Any testing cap is applied to the BUILD fan-out instead,
   * not here: the plan is one call and it's the interesting artifact, while the per-channel
   * builds are what actually cost money. So you can see the whole lineup it would build and
   * only pay to construct a sample of it.
   */
  const exactCount = opts.targetChannels;

  const { object, usage } = await generateObject({
    model: getModel(connection),
    schema: planSchema,
    system: SYSTEM,
    prompt: [
      libraryContext,
      "",
      "EXISTING PACKAGES — you may file channels into any of these instead of creating a new one:",
      formatExistingPackages(opts.existingPackages ?? []),
      "",
      exactCount
        ? `Propose exactly ${exactCount} channel${exactCount === 1 ? "" : "s"} — a representative sample of the lineup you would build, spread across different kinds of channel rather than ${exactCount} variations on one idea.`
        : "Build the full lineup for this library. Use as many channels and packages as it genuinely takes to cover it — see COVERAGE below.",
      "Give every channel a complete, working filter built from the vocabulary above.",
    ].join("\n"),
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  });

  console.log(
    `[plan] tokens in=${usage?.inputTokens ?? 0} out=${usage?.outputTokens ?? 0}` +
      ` cacheRead=${usage?.inputTokenDetails?.cacheReadTokens ?? 0}` +
      ` cacheWrite=${usage?.inputTokenDetails?.cacheWriteTokens ?? 0}`,
  );

  // Filters are sanitized here so a bad condition never reaches the build fan-out.
  // Numbering happens later, in its own step — see `assignChannelNumbers`.
  return { packages: sanitizePlan(object.packages) };
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
