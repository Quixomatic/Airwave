/**
 * The per-channel builder (§7.3a §4.4) — turns a planned channel CONCEPT into a real
 * channel with a verified Plex filter.
 *
 * This is where the quality comes from. The planner only proposes intent ("wall-to-wall
 * Power Rangers", "Toho and Golden Harvest genre cinema"); this grounds that into an
 * actual filter tree by discovering the library's REAL tag values and previewing the
 * result before committing. A concept that can't be filled is reported as skipped rather
 * than becoming an empty channel.
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

import { getActiveConnection, getModel } from "./config";
import type { PlannedChannel } from "./lineup-plan";
import {
  createChannel,
  discoverFieldValues,
  listFilterFields,
  previewFilter,
  searchTitles,
} from "./tools";

export type ChannelBuildResult = {
  key: string;
  name: string;
  number: number;
  status: "created" | "skipped" | "failed";
  channelId?: string;
  poolSize?: number;
  reason?: string;
};

/** Below this a channel loops too tightly to be worth creating. */
const MIN_POOL_SIZE = 5;
/** Enough room to discover values, preview a few candidate filters, and commit. */
const MAX_STEPS = 24;

const mediaTypesSchema = z.array(z.enum(["movie", "show"])).min(1);

// The recursive predicate tree, matching the real FilterNode shape.
const conditionSchema = z.object({
  type: z.literal("condition"),
  field: z.string(),
  op: z.string(),
  value: z.string(),
});
type FilterNodeInput = z.infer<typeof conditionSchema> | { type: "group"; op: "and" | "or"; children: FilterNodeInput[] };
const filterNodeSchema: z.ZodType<FilterNodeInput> = z.lazy(() =>
  z.union([
    conditionSchema,
    z.object({
      type: z.literal("group"),
      op: z.enum(["and", "or"]),
      children: z.array(filterNodeSchema),
    }),
  ]),
);

const SYSTEM = `You build ONE live-TV channel by turning a description into a verified Plex filter.

PROCESS — follow it in order:
1. \`list_filter_fields\` to see what you can filter on.
2. \`discover_field_values\` for any tag field you intend to use (genre, studio, network, contentRating…). The library's tag values are what they are — never guess a value you haven't seen. "Anime" may not exist as a genre even when the library is full of anime; "Animation" plus specific show titles may be the real route.
3. \`preview_filter\` to test your filter and see what it actually matches. Iterate until the result genuinely matches the channel's description.
4. \`commit_channel\` once you're satisfied.

RULES:
- The pool must be big enough to sustain a channel. Aim near the stated target; a handful of items means constant repetition.
- The pool must be RIGHT, not just big. A channel that matches everything is worse than a narrow one. Check the sample titles in the preview actually belong.
- \`title\` with the "is" operator is a Plex SUBSTRING match, not exact — \`title is "Bear"\` matches anything containing "Bear".
- For a channel about specific shows, filtering by show title (or several, OR'd together) is often better than by genre.
- If after genuine effort nothing sensible matches, call \`give_up\` with the reason. An empty or wrong channel is worse than no channel.
- Call \`commit_channel\` or \`give_up\` exactly once. Do not commit more than one channel.`;

export type BuildChannelArgs = {
  channel: PlannedChannel;
  packageId: string;
  mediaSourceId: string;
  userId: string;
  /** `fast` skips the agent loop; reserved for the cheaper deterministic path. */
  mode?: "quality" | "fast";
};

export async function buildPlannedChannel(
  prisma: PrismaClient,
  args: BuildChannelArgs,
): Promise<ChannelBuildResult> {
  const { channel, packageId, mediaSourceId, userId } = args;
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

  const connection = await getActiveConnection(prisma);
  if (!connection) return { ...base, status: "failed", reason: "No active AI connection." };

  // Outcome is captured from the terminal tool rather than parsed out of the model's
  // prose — the loop ends when one of these fires.
  let outcome: ChannelBuildResult | null = null;

  const tools = {
    list_filter_fields: tool({
      description: "List the filterable fields and their operators.",
      inputSchema: z.object({}),
      execute: async () => listFilterFields(),
    }),

    discover_field_values: tool({
      description:
        "List the REAL values present in the library for a tag field (genre, studio, contentRating…). Always check before filtering on one.",
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
      }),
      execute: async ({ mediaTypes, filter, sortField, sortDir }) =>
        previewFilter(prisma, {
          mediaSourceId,
          mediaTypes,
          filter: filter as never,
          sortField,
          sortDir,
          detail: "quick",
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
    await generateText({
      model: getModel(connection),
      system: SYSTEM,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      prompt: [
        `CHANNEL: ${channel.name}`,
        `DESCRIPTION: ${channel.description}`,
        `WHAT BELONGS ON IT: ${channel.theme}`,
        `TARGET POOL SIZE: about ${channel.targetPoolSize} items`,
        `ORDERING: ${channel.ordering}`,
        "",
        "Build and verify the filter, then commit it.",
      ].join("\n"),
    });
  } catch (err) {
    return { ...base, status: "failed", reason: err instanceof Error ? err.message : String(err) };
  }

  // Ran out of steps without committing or giving up.
  return outcome ?? { ...base, status: "failed", reason: "Agent finished without committing a channel." };
}
