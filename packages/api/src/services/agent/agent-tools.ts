import type { PrismaClient } from "@airwave/db";
import { tool } from "ai";
import { z } from "zod";

import { aiFilterSchema } from "./ai-filter-schema";
import {
  addChannelItems,
  addChannelSources,
  clearAiGenerated,
  createChannel,
  createPackage,
  deleteChannel,
  deletePackage,
  discoverFieldValues,
  getChannel,
  getPackage,
  libraryOverview,
  listChannelItems,
  listChannels,
  listCollections,
  listFilterFields,
  listMediaSources,
  listPackages,
  listPlaylists,
  previewChannel,
  previewFilter,
  previewManual,
  previewMembership,
  removeChannelItems,
  removeChannelSources,
  renumberChannels,
  searchTitles,
  showEpisodes,
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

// A membership source: a Plex playlist or collection by ratingKey (from list_playlists / list_collections).
const membershipSource = z.object({
  type: z.enum(["playlist", "collection"]),
  key: z.string().describe("the playlist/collection ratingKey from list_playlists / list_collections"),
  title: z.string().optional(),
});

const channelInput = z.object({
  name: z.string().min(1),
  mediaSourceId: z.string(),
  mediaTypes: z.array(mediaType).min(1),
  filter: filterNode.optional().describe("The predicate tree. Build it ONLY from list_filter_fields + discover_field_values, and test with preview_filter first."),
  // Non-filter modes. LEAVE BOTH UNSET unless the user EXPLICITLY asks for a playlists/collections or manual
  // channel — a normal channel is a filter (PREDICATE) channel and that is always the default + preferred.
  sources: z
    .array(membershipSource)
    .optional()
    .describe("ONLY when the user explicitly wants a playlists/collections channel. Makes this a membership channel; the filter is ignored."),
  manualItemKeys: z
    .array(z.string())
    .optional()
    .describe("ONLY when the user explicitly wants a hand-picked channel. Makes this a manual channel of these exact ratingKeys; the filter is ignored."),
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

    // ---- Membership discovery + mode-specific previews (read) ----
    // Most channels are filter channels; these are only needed when working with the two other modes.
    list_playlists: tool({
      description: "List the source's Plex video playlists (key, title, item count, smart) — for building or inspecting a 'playlists & collections' (membership) channel.",
      inputSchema: z.object({ mediaSourceId: z.string() }),
      execute: (a) => listPlaylists(prisma, a),
    }),
    list_collections: tool({
      description: "List the source's Plex collections across its movie/show libraries (key, title, item count, library) — for a membership channel.",
      inputSchema: z.object({ mediaSourceId: z.string() }),
      execute: (a) => listCollections(prisma, a),
    }),
    preview_membership: tool({
      description:
        "Resolve an UNSAVED set of playlists/collections to a preview (count + coalesced items), exactly like preview_filter does for filters. Test a membership channel's exact sources OR a hypothetical set before saving.",
      inputSchema: z.object({ mediaSourceId: z.string(), sources: z.array(membershipSource), detail }),
      execute: (a) => previewMembership(prisma, a),
    }),
    preview_manual: tool({
      description:
        "Resolve an UNSAVED list of hand-picked ratingKeys to a preview (count + coalesced items). Get the ratingKeys from preview_filter / search_titles (whole shows + movies) or show_episodes (specific episodes).",
      inputSchema: z.object({ mediaSourceId: z.string(), itemKeys: z.array(z.string()), detail }),
      execute: (a) => previewManual(prisma, a),
    }),
    show_episodes: tool({
      description: "A show's episodes grouped by season (ratingKey, SxxExx, title) — to pick specific episodes' ratingKeys for a manual channel.",
      inputSchema: z.object({ mediaSourceId: z.string(), showRatingKey: z.string() }),
      execute: (a) => showEpisodes(prisma, a),
    }),
    preview_channel: tool({
      description:
        "Preview a SAVED channel's resolved pool (works for ANY mode — filter, membership, or manual). Shows what actually plays, with a show's episodes coalesced into one item.",
      inputSchema: z.object({ id: z.string(), detail }),
      execute: (a) => previewChannel(prisma, a),
    }),

    // ---- Inspection (read) ----
    list_channels: tool({ description: "List all channels (id, number, name, enabled, package, and `mode`: filter / membership / manual).", inputSchema: z.object({}), execute: () => listChannels(prisma) }),
    get_channel: tool({
      description:
        "Full channel config. `mode` says how its content is defined: filter (returns the predicate tree), membership (returns its playlists/collections `sources`), or manual (returns a count + sample; use list_channel_items for the full list).",
      inputSchema: z.object({ id: z.string() }),
      execute: ({ id }) => getChannel(prisma, id),
    }),
    list_channel_items: tool({
      description: "The full labeled list of a MANUAL channel's hand-picked members (what to add/remove against). detail='quick' trims fields.",
      inputSchema: z.object({ id: z.string(), detail }),
      execute: ({ id, detail: d }) => listChannelItems(prisma, id, d),
    }),
    list_packages: tool({ description: "List all packages (id, name, channel count).", inputSchema: z.object({}), execute: () => listPackages(prisma) }),
    get_package: tool({ description: "A package + its channels.", inputSchema: z.object({ id: z.string() }), execute: ({ id }) => getPackage(prisma, id) }),

    // ---- Channel writes (approval-gated) ----
    create_channel: tool({
      description:
        "Create a channel. DEFAULT to a FILTER channel (build + test the filter with preview_filter first) — that's the normal, preferred kind. ONLY set `sources` (a playlists/collections channel) or `manualItemKeys` (a hand-picked channel) when the user EXPLICITLY asks for that mode. Requires approval.",
      inputSchema: channelInput,
      needsApproval: true,
      execute: (a) => createChannel(prisma, userId, a),
    }),
    update_channel: tool({
      description:
        "Update a channel — pass ONLY the fields to change (number, packageId, enabled, filter, sortField, tint, name, …). `filter`/`mediaTypes` apply to FILTER channels only; for a membership or manual channel use the source/item tools. A channel's mode can't be switched. Requires approval.",
      inputSchema: channelPatch.extend({ id: z.string() }),
      needsApproval: true,
      execute: ({ id, ...patch }) => updateChannel(prisma, id, patch),
    }),
    // Member editing for the two non-filter modes. Each requires the channel to already be that mode.
    add_channel_sources: tool({
      description: "Add playlists/collections to a MEMBERSHIP channel (dedup). Get keys from list_playlists / list_collections. Requires approval.",
      inputSchema: z.object({ id: z.string(), sources: z.array(membershipSource).min(1) }),
      needsApproval: true,
      execute: ({ id, sources }) => addChannelSources(prisma, id, sources),
    }),
    remove_channel_sources: tool({
      description: "Remove playlists/collections (by ratingKey) from a MEMBERSHIP channel. Requires approval.",
      inputSchema: z.object({ id: z.string(), keys: z.array(z.string()).min(1) }),
      needsApproval: true,
      execute: ({ id, keys }) => removeChannelSources(prisma, id, keys),
    }),
    add_channel_items: tool({
      description: "Add hand-picked ratingKeys (movie / show / episode) to a MANUAL channel (dedup). Find keys via preview_filter, search_titles, or show_episodes. Requires approval.",
      inputSchema: z.object({ id: z.string(), itemKeys: z.array(z.string()).min(1) }),
      needsApproval: true,
      execute: ({ id, itemKeys }) => addChannelItems(prisma, id, itemKeys),
    }),
    remove_channel_items: tool({
      description: "Remove hand-picked ratingKeys from a MANUAL channel (see list_channel_items for what's in it). Requires approval.",
      inputSchema: z.object({ id: z.string(), itemKeys: z.array(z.string()).min(1) }),
      needsApproval: true,
      execute: ({ id, itemKeys }) => removeChannelItems(prisma, id, itemKeys),
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
