/**
 * The per-channel builder (§7.3a §4.4) — turns a planned channel CONCEPT into a real
 * channel with a verified Plex filter.
 *
 * The planner now supplies a candidate filter (it has the whole tag vocabulary), so this is
 * a VERIFY-AND-COMMIT loop, not an exploratory one: preview the proposal, commit if it fits,
 * adjust once if it doesn't, give up if nothing sensible matches. A concept that can't be
 * filled is reported as skipped rather than becoming an empty channel.
 *
 * Why that shape: a preview payload is re-sent on every subsequent step of the loop, so
 * exploration is quadratic. Measured before this change: ~117k input tokens PER CHANNEL, and
 * one build exceeded Haiku's entire 200k context on its own previews.
 *
 * It runs the same grounded tool loop the chat agent uses, minus the approval gate — the
 * gate lives in the agent-tools WRAPPER, not in these services, which is exactly why the
 * workflow can reuse them autonomously.
 *
 * NOTE ON DURABILITY: the plan (§4.4) called for a `WorkflowAgent` so each TOOL CALL is
 * individually checkpointed. This uses a plain `generateText` tool loop inside a durable
 * STEP instead: the whole channel build is the retry unit rather than each tool call.
 * A channel build is seconds-to-minutes, so the coarser granularity costs little, and it
 * avoids taking on `@ai-sdk/workflow` before we need it. Revisit if builds get long.
 */
import type { PrismaClient } from "@ChannelGuide/db";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import { getConnectionForRole, getModel } from "./config";
import type { PlannedChannel } from "./lineup-plan";
import {
  createChannel,
  discoverFieldValues,
  listFilterFields,
  previewFilter,
  searchTitles,
} from "./tools";

export type ChannelUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the shared prompt cache (~0.1x price). */
  cacheReadTokens: number;
  /** Input tokens written to the cache (~1.25x price) — the first build pays this. */
  cacheWriteTokens: number;
  steps: number;
};

export type ChannelBuildResult = {
  key: string;
  name: string;
  number: number;
  status: "created" | "skipped" | "failed";
  channelId?: string;
  poolSize?: number;
  reason?: string;
  /** What this channel's agent loop cost. Absent when no LLM call was made. */
  usage?: ChannelUsage;
};

/**
 * Below this a channel has essentially nothing to play. Deliberately tiny: the pool is
 * counted in ITEMS (episodes for TV), so three shows with 200 episodes each is a pool of
 * ~600 and an excellent rerun channel. Judging a channel by how many *shows* it matched is
 * how good channels get wrongly skipped.
 */
const MIN_POOL_SIZE = 3;

/**
 * COST MODEL — worth understanding before changing any of this.
 *
 * An agent loop re-sends the whole conversation on every step, so tokens grow
 * QUADRATICALLY with step count. What saves us is where the prompt-cache breakpoint sits:
 *
 *  - CACHED (shared by every channel in the run, paid once): the system prompt, the tool
 *    definitions, the library profile, and the full filter vocabulary. Byte-identical
 *    across all 50 builds → one cache entry, so size here is nearly free.
 *  - NOT CACHED (re-sent every step of that build): the agent's tool calls and their
 *    results. This is the quadratic part, and the only thing that needs rationing.
 *
 * Hence: the vocabulary is hoisted into the cached prefix rather than fetched as a tool
 * result, and `preview_filter` — the one genuinely per-channel, per-iteration payload —
 * is pinned to the leanest `detail: "quick"` projection with no way for the model to ask
 * for `verbose` (which measured ~270k chars on a large filter).
 *
 * With discovery pre-loaded, builds converge in far fewer steps, so this cap is headroom
 * for a stubborn channel rather than a routine cost.
 */
const MAX_STEPS = 24;

const mediaTypesSchema = z.array(z.enum(["movie", "show"])).min(1);

// The recursive predicate tree, matching the real FilterNode shape.
const conditionSchema = z.object({
  type: z.literal("condition"),
  field: z.string(),
  op: z.string(),
  value: z.string(),
});
// Groups combine with `combinator`; conditions compare with `op`. The resolver reads
// `node.combinator` and silently falls back to AND when it's absent, so getting this wrong
// turns every OR into an AND with no error — see the note in lineup-plan.ts.
type FilterNodeInput =
  | z.infer<typeof conditionSchema>
  | { type: "group"; combinator: "and" | "or"; children: FilterNodeInput[] };
const filterNodeSchema: z.ZodType<FilterNodeInput> = z.lazy(() =>
  z.union([
    conditionSchema,
    z.object({
      type: z.literal("group"),
      combinator: z.enum(["and", "or"]),
      children: z.array(filterNodeSchema),
    }),
  ]),
);

const SYSTEM = `You BUILD one live-TV channel. A planner has drafted a candidate filter from the library's real tag vocabulary — treat it as a STARTING POINT to refine, not a proposal to accept or reject.

PROCESS:
1. \`preview_filter\` the draft. Look at the count and the sample.
2. If it genuinely matches the channel's description, \`commit_channel\` immediately. Don't keep exploring a filter that already works.
3. If it's wrong, FIX IT: adjust the filter and preview again, passing \`detail: "compact"\` on these follow-up checks (same items, far cheaper). Add a title constraint, an exclusion, or another dimension — then re-preview. Repeat until it's right, then commit with a final \`quick\` preview to confirm.
4. Use \`list_filter_fields\` only if you need an operator you don't know. The tag values are already in your context below — never fetch them again.

**IF YOU CAN DESCRIBE A BETTER FILTER, YOU MUST TRY IT.** Diagnosing the problem is not finishing the job. Writing "the correct approach would be X" and then giving up is a failure — if you can name X, build X and preview it. \`give_up\` is only for when you have ALREADY tried real alternatives and the library genuinely cannot support the channel (e.g. only three matching titles exist). Never give up on your first preview.

The library's tag values are what they are — never use a value that isn't in the vocabulary below. "Anime" may not exist as a genre even when the library is full of anime; "Animation" plus specific show titles may be the real route.

RULES:
- **A few shows is a GREAT channel.** Judge the pool by RUNTIME, not item count. Three sitcoms with 200 episodes each is 600 episodes — weeks of programming, and exactly what a rerun channel is. Never skip a channel because it matched few *shows*; look at the episode counts. The target pool size is a loose hint, not a requirement — overshooting it is fine, and a big pool is not a problem.
- **TRUST USER-CURATED TAGS ABSOLUTELY.** \`label\` values were applied BY HAND by the library's owner. If a show is labelled "Anime", it is anime — full stop. Never second-guess a label because titles look misclassified to you; the owner's judgement about their own library beats yours, and a label is the single most reliable signal available.
- The pool must be RIGHT, not just big. A channel that matches everything (no meaningful predicate at all) is worse than a narrow one. Check the sample titles actually belong — but "more items than I expected" is not a reason to reject a filter.
- \`title\` with the "is" operator is a Plex SUBSTRING match, not exact — \`title is "Bear"\` matches anything containing "Bear".
- For a channel about specific shows, filtering by show title (or several, OR'd together) is often better than by genre.
- If after genuine effort nothing sensible matches, call \`give_up\` with the reason. An empty or wrong channel is worse than no channel.
- Call \`commit_channel\` or \`give_up\` exactly once. Do not commit more than one channel.`;

export type BuildChannelArgs = {
  channel: PlannedChannel;
  packageId: string;
  mediaSourceId: string;
  userId: string;
  /**
   * The rendered library profile, IDENTICAL for every channel in a run. It both grounds
   * the agent (it can see what's actually there before probing) and — because it's the
   * same bytes every time — rides in the shared cached prefix rather than being re-billed.
   */
  libraryContext: string;
  /** `fast` skips the agent loop; reserved for the cheaper deterministic path. */
  mode?: "quality" | "fast";
};

export async function buildPlannedChannel(
  prisma: PrismaClient,
  args: BuildChannelArgs,
): Promise<ChannelBuildResult> {
  const { channel, packageId, mediaSourceId, userId, libraryContext } = args;
  const base = { key: channel.key, name: channel.name, number: channel.number };

  // IDEMPOTENCY — this runs inside a durable step, and a step that fails ANYWHERE is
  // retried from the top. Creating the channel is a side effect, so without this guard a
  // retry hits `Unique constraint failed on the fields: (number)` and the channel is
  // reported as skipped even though it exists. Plan-assigned numbers make the check
  // trivial: if this channel is already there, the work is done.
  const existing = await prisma.channel.findUnique({
    where: { number: channel.number },
    select: { id: true, aiGenerated: true },
  });
  if (existing) {
    if (!existing.aiGenerated) {
      return { ...base, status: "skipped", reason: `Channel ${channel.number} is not AI-generated — refusing to touch it.` };
    }
    return { ...base, status: "created", channelId: existing.id, reason: "Already built (step retry)." };
  }

  // The WORKER role: this loop runs ~50 times per lineup build and dominates the run's cost,
  // so it's the one worth pointing at a cheap model. Falls back to the active (chat)
  // connection when no dedicated worker is configured.
  const connection = await getConnectionForRole(prisma, "worker");
  if (!connection) return { ...base, status: "failed", reason: "No active AI connection." };

  // Outcome is captured from the terminal tool rather than parsed out of the model's
  // prose — the loop ends when one of these fires.
  let outcome: ChannelBuildResult | null = null;
  let usage: ChannelUsage | undefined;

  const tools = {
    list_filter_fields: tool({
      description: "List the filterable fields and their operators.",
      inputSchema: z.object({}),
      execute: async () => listFilterFields(),
    }),

    discover_field_values: tool({
      description:
        "List the REAL values for a tag field. The common ones (genre, studio, network, contentRating, collection, country, resolution, label) are ALREADY in your context — only call this for the rarer fields like actor, director or writer.",
      inputSchema: z.object({
        field: z.string(),
        mediaTypes: mediaTypesSchema,
      }),
      execute: async ({ field, mediaTypes }) =>
        discoverFieldValues(prisma, { mediaSourceId, mediaTypes, field }),
    }),

    search_titles: tool({
      description: "Find titles in the library by substring — use it to confirm a show/movie exists before filtering on it.",
      inputSchema: z.object({ query: z.string(), mediaTypes: mediaTypesSchema }),
      execute: async ({ query, mediaTypes }) =>
        searchTitles(prisma, { mediaSourceId, mediaTypes, query, detail: "quick" }),
    }),

    preview_filter: tool({
      description: "Resolve a candidate filter and see how many items match, with a sample. Use before committing.",
      inputSchema: z.object({
        mediaTypes: mediaTypesSchema,
        filter: filterNodeSchema.optional(),
        sortField: z.string().optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
        detail: z
          .enum(["quick", "compact"])
          .optional()
          .describe(
            'Leave unset for a first look at a new filter ("quick" — full item detail). Pass "compact" on FOLLOW-UP checks of a refinement: same items, same counts, ~4x cheaper. Preview payloads are re-sent on every later step, so compact keeps a long build affordable.',
          ),
      }),
      execute: async ({ mediaTypes, filter, sortField, sortDir, detail }) =>
        previewFilter(prisma, {
          mediaSourceId,
          mediaTypes,
          filter: filter as never,
          sortField,
          sortDir,
          detail: detail ?? "quick",
        }),
    }),

    commit_channel: tool({
      description: "Create the channel with the verified filter. Call exactly once, after previewing.",
      inputSchema: z.object({
        mediaTypes: mediaTypesSchema,
        filter: filterNodeSchema.optional(),
        poolSize: z.number().int().describe("The item count your final preview returned."),
      }),
      execute: async ({ mediaTypes, filter, poolSize }) => {
        if (poolSize < MIN_POOL_SIZE) {
          outcome = { ...base, status: "skipped", poolSize, reason: `Only ${poolSize} items matched.` };
          return { ok: false, message: `Pool too small (${poolSize}). Broaden the filter or give_up.` };
        }
        try {
          const created = await createChannel(prisma, userId, {
            mediaSourceId,
            name: channel.name,
            number: channel.number,
            packageId,
            description: channel.description,
            callsign: channel.callsign,
            icon: channel.icon,
            tint: channel.accent,
            ordering: channel.ordering,
            sortField: channel.sortField,
            sortDir: channel.sortDir,
            mediaTypes,
            filter: filter as never,
          });
          outcome = { ...base, status: "created", channelId: created.id, poolSize };
          return { ok: true, channelId: created.id, number: created.number };
        } catch (err) {
          // Belt-and-braces against a retry racing the guard above. Treat "the channel
          // already exists at my number" as success rather than sending the agent into a
          // retry loop it can't fix — it has no way to resolve a numbering conflict.
          const taken = await prisma.channel.findUnique({
            where: { number: channel.number },
            select: { id: true },
          });
          if (taken) {
            outcome = { ...base, status: "created", channelId: taken.id, poolSize, reason: "Already existed." };
            return { ok: true, channelId: taken.id, number: channel.number };
          }
          throw err;
        }
      },
    }),

    give_up: tool({
      description: "Abandon this channel because nothing sensible matches. Explain why.",
      inputSchema: z.object({ reason: z.string() }),
      execute: async ({ reason }) => {
        outcome = { ...base, status: "skipped", reason };
        return { ok: true };
      },
    }),
  };

  try {
    const result = await generateText({
      model: getModel(connection),
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      // The static instructions. Rendered before `messages`, so it's inside the cached span.
      system: SYSTEM,
      messages: [
        {
          role: "user",
          // ONE shared, cached prefix for the WHOLE run. An Anthropic cache breakpoint
          // caches everything UP TO AND INCLUDING the marked block — so putting it here
          // caches tools + system + this library context, all of which are byte-identical
          // across every channel build in the run. The per-channel brief goes in the NEXT
          // message so it stays outside the cached span.
          //
          // Two ways to get this wrong, both of which cost real money:
          //  1. A request-level breakpoint swallows the channel brief → every build has a
          //     unique prefix, shares nothing, and re-pays for the same ~4k tokens 50×.
          //  2. A `{role: "system"}` entry in `messages` → the AI SDK rejects the whole
          //     request ("System messages are not allowed in the prompt or messages
          //     fields"). Static instructions belong in the `system` parameter above.
          content: `THE LIBRARY YOU ARE BUILDING FROM:\n${libraryContext}`,
          providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
        },
        {
          role: "user",
          content: [
            `CHANNEL: ${channel.name}`,
            `DESCRIPTION: ${channel.description}`,
            `WHAT BELONGS ON IT: ${channel.theme}`,
            `TARGET POOL SIZE: about ${channel.targetPoolSize} items`,
            `ORDERING: ${channel.ordering}`,
            `MEDIA TYPES: ${channel.mediaTypes.join(", ")}`,
            "",
            "PROPOSED FILTER (verify this first):",
            JSON.stringify(channel.filter),
          ].join("\n"),
        },
      ],
    });

    // Record what this channel actually cost. Without per-channel numbers a run's spend
    // is invisible until the bill arrives.
    usage = {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      // Proof that the shared prefix is actually being served from cache rather than
      // re-billed. Without this we were guessing about caching — twice, wrongly.
      // NB these live under `inputTokenDetails`, not on `usage` directly.
      cacheReadTokens: result.usage?.inputTokenDetails?.cacheReadTokens ?? 0,
      cacheWriteTokens: result.usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
      steps: result.steps?.length ?? 0,
    };
  } catch (err) {
    return { ...base, status: "failed", usage, reason: err instanceof Error ? err.message : String(err) };
  }

  // Ran out of steps without committing or giving up.
  return {
    ...(outcome ?? { ...base, status: "failed", reason: "Agent finished without committing a channel." }),
    usage,
  };
}
