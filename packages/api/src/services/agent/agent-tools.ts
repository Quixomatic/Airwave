import type { PrismaClient } from "@airwave/db";
import { tool } from "ai";
import { z } from "zod";

import { aiFilterSchema } from "./ai-filter-schema";
import {
  clearAiGenerated,
  createChannel,
  createPackage,
  deleteChannel,
  deletePackage,
  discoverFieldValues,
  getChannel,
  getPackage,
  libraryOverview,
  listChannels,
  listFilterFields,
  listMediaSources,
  listPackages,
  previewFilter,
  renumberChannels,
  searchTitles,
  updateChannel,
  updateChannels,
  updatePackage,
} from "./tools";

/**
 * The agent's tools — thin Vercel AI SDK wrappers over the reusable services in `./tools`. Reads run
 * freely; WRITES are `needsApproval: true`, so the chat pauses for the admin to approve (the future
 * workflow-SDK job calls the services directly and runs autonomously). `buildAgentTools` closes over
 * prisma + the acting user so the tools need no ambient context.
 */

const mediaType = z.enum(["movie", "show"]);
const detail = z
  .enum(["quick", "default", "verbose"])
  .optional()
  .describe("Preview depth: 'quick' = trimmed metadata, 'default' = full item metadata with episodes coalesced into their show, 'verbose' = every matched episode as a full item.");

// One-level, string-tolerant filter schema for the AI tools (see ai-filter-schema.ts + GitHub #3). The
// resolver still accepts arbitrary depth; the admin builder + planner already cap authoring at one level.
const filterNode = aiFilterSchema();

const channelInput = z.object({
  name: z.string().min(1),
  mediaSourceId: z.string(),
  mediaTypes: z.array(mediaType).min(1),
  filter: filterNode.optional().describe("The predicate tree. Build it ONLY from list_filter_fields + discover_field_values, and test with preview_filter first."),
  ordering: z.enum(["SHUFFLE", "IN_ORDER", "BY_AIR_DATE"]).optional(),
  sortField: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
  packageId: z.string().nullable().optional(),
  number: z.number().int().optional(),
  callsign: z.string().nullable().optional(),
  icon: z.string().nullable().optional().describe('e.g. "lucide:Tv"'),
  tint: z.string().nullable().optional().describe("an accent key, e.g. blue / orange / green"),
  description: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});
const channelPatch = channelInput.partial();

export function buildAgentTools(prisma: PrismaClient, userId: string) {
  return {
    // ---- Discovery / grounding (read) ----
    list_media_sources: tool({
      description: "List the connected media source(s) + their enabled libraries and item counts. Call first to get the mediaSourceId.",
      inputSchema: z.object({}),
      execute: () => listMediaSources(prisma),
    }),
    library_overview: tool({
      description: "Counts of movies/shows/episodes for a source.",
      inputSchema: z.object({ mediaSourceId: z.string() }),
      execute: ({ mediaSourceId }) => libraryOverview(prisma, mediaSourceId),
    }),
    list_filter_fields: tool({
      description: "The catalog of filterable fields (field key, label, kind, allowed operators). Build filters ONLY from these fields.",
      inputSchema: z.object({}),
      execute: () => listFilterFields(),
    }),
    discover_field_values: tool({
      description: "Real available values for a tag field (e.g. genre, studio, actor, contentRating) from the live library.",
      inputSchema: z.object({ mediaSourceId: z.string(), mediaTypes: z.array(mediaType), field: z.string() }),
      execute: (a) => discoverFieldValues(prisma, a),
    }),
    search_titles: tool({
      description:
        "Find titles whose name contains a query (does the library have X?). Returns matching items as full PlexItems — a show's episodes are coalesced into ONE show item with episode/season counts; movies pass through.",
      inputSchema: z.object({ mediaSourceId: z.string(), mediaTypes: z.array(mediaType), query: z.string(), detail }),
      execute: (a) => searchTitles(prisma, a),
    }),
    preview_filter: tool({
      description:
        "Resolve an UNSAVED filter tree to a preview: total match count + the matching items as full PlexItems. A show's many episodes are COALESCED into a single show item carrying `episodes` + `seasons` counts (so a channel of thousands of episodes shows as its handful of shows); movies pass through individually. ALWAYS test a filter here before creating a channel. Use detail='quick' for a fast glance, 'default' (full item metadata) normally, or 'verbose' to see every matched episode.",
      inputSchema: z.object({
        mediaSourceId: z.string(),
        mediaTypes: z.array(mediaType),
        filter: filterNode.optional(),
        sortField: z.string().optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
        detail,
      }),
      execute: (a) => previewFilter(prisma, a),
    }),

    // ---- Inspection (read) ----
    list_channels: tool({ description: "List all channels (id, number, name, enabled, package).", inputSchema: z.object({}), execute: () => listChannels(prisma) }),
    get_channel: tool({ description: "Full channel incl. its filter tree, sort, package, appearance.", inputSchema: z.object({ id: z.string() }), execute: ({ id }) => getChannel(prisma, id) }),
    list_packages: tool({ description: "List all packages (id, name, channel count).", inputSchema: z.object({}), execute: () => listPackages(prisma) }),
    get_package: tool({ description: "A package + its channels.", inputSchema: z.object({ id: z.string() }), execute: ({ id }) => getPackage(prisma, id) }),

    // ---- Channel writes (approval-gated) ----
    create_channel: tool({
      description: "Create a channel. Test the filter with preview_filter first. Requires approval.",
      inputSchema: channelInput,
      needsApproval: true,
      execute: (a) => createChannel(prisma, userId, a),
    }),
    update_channel: tool({
      description: "Update a channel — pass ONLY the fields to change (number, packageId, enabled, filter, sortField, tint, name, …). Requires approval.",
      inputSchema: channelPatch.extend({ id: z.string() }),
      needsApproval: true,
      execute: ({ id, ...patch }) => updateChannel(prisma, id, patch),
    }),
    delete_channel: tool({ description: "Delete a channel. Requires approval.", inputSchema: z.object({ id: z.string() }), needsApproval: true, execute: ({ id }) => deleteChannel(prisma, id) }),
    update_channels: tool({
      description: "Bulk-move channels to a package (packageId, or null to unassign) and/or enable/disable them. Requires approval.",
      inputSchema: z.object({ ids: z.array(z.string()).min(1), packageId: z.string().nullable().optional(), enabled: z.boolean().optional() }),
      needsApproval: true,
      execute: ({ ids, ...patch }) => updateChannels(prisma, ids, patch),
    }),
    renumber_channels: tool({
      description: "Set channel numbers in bulk. Requires approval.",
      inputSchema: z.object({ mapping: z.array(z.object({ channelId: z.string(), number: z.number().int() })).min(1) }),
      needsApproval: true,
      execute: ({ mapping }) => renumberChannels(prisma, mapping),
    }),

    // ---- Package writes (approval-gated) ----
    create_package: tool({
      description: "Create a package (a group of channels). Requires approval.",
      inputSchema: z.object({ name: z.string().min(1), description: z.string().nullable().optional(), icon: z.string().nullable().optional(), tint: z.string().nullable().optional() }),
      needsApproval: true,
      execute: (a) => createPackage(prisma, a),
    }),
    update_package: tool({
      description: "Update a package's name/description/appearance. Requires approval.",
      inputSchema: z.object({ id: z.string(), name: z.string().optional(), description: z.string().nullable().optional(), icon: z.string().nullable().optional(), tint: z.string().nullable().optional() }),
      needsApproval: true,
      execute: ({ id, ...patch }) => updatePackage(prisma, id, patch),
    }),
    delete_package: tool({ description: "Delete a package (its channels become unassigned). Requires approval.", inputSchema: z.object({ id: z.string() }), needsApproval: true, execute: ({ id }) => deletePackage(prisma, id) }),

    // ---- Cleanup ----
    clear_ai_generated: tool({
      description: "Delete everything the assistant/workflow created (aiGenerated). Requires approval.",
      inputSchema: z.object({ scope: z.enum(["channels", "packages", "both"]) }),
      needsApproval: true,
      execute: ({ scope }) => clearAiGenerated(prisma, scope),
    }),
  };
}
