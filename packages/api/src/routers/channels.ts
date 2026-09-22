import { Prisma } from "@airwave/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { toAccentKey } from "../services/accents";
import { getGuideGrid } from "../services/guide";
import { runJob } from "../services/jobs/scheduler";
import { getCollections, getFilterValues, getPlaylists } from "../services/plex/client";
import { FILTER_FIELDS, FILTER_OPS, OPS_FOR_KIND, fieldMeta } from "../services/plex/filter-fields";
import { resolveChannel } from "../services/plex/resolve";
import { decryptToken } from "../services/plex/token";
import { getSourceReadiness, notReadyReason } from "../services/sources/readiness";
import {
  itemLabels as itemLabelsService,
  previewItems,
  previewFilter as resolvePreviewFilter,
  previewManual as resolvePreviewManual,
  previewMembership as resolvePreviewMembership,
  searchMedia as searchMediaService,
  showEpisodes as showEpisodesService,
} from "../services/agent/tools";
import { SORT_FIELDS } from "../services/plex/sort-fields";
import { normalizeCallsign } from "../services/generator/callsign";
import {
  INITIAL_WINDOW_SECONDS,
  extendChannelSchedule,
  generateChannelSchedule,
  getChannelTimeline,
  getNowNext,
} from "../services/schedule/generate";

const orderingEnum = z.enum(["SHUFFLE", "IN_ORDER", "BY_AIR_DATE"]);
const mediaTypeEnum = z.enum(["movie", "show"]);
const bumperModeEnum = z.enum(["INHERIT", "OFF", "INTERSTITIAL_ONLY", "FULL"]);
const opEnum = z.enum(FILTER_OPS);

// A MEMBERSHIP definition's ordered source list: Plex playlists/collections unioned into the pool. When a
// create/update carries a non-empty `sources`, the channel is a MEMBERSHIP channel (its filter is ignored);
// otherwise it's a PREDICATE (filter) channel as before. `key` is the playlist/collection ratingKey.
const membershipSourceSchema = z.object({
  type: z.enum(["playlist", "collection"]),
  key: z.string().min(1),
  title: z.string().optional(),
});
const sourcesSchema = z.array(membershipSourceSchema).optional();
// MANUAL_ITEMS: an ordered list of hand-picked ratingKeys (movie / show / episode). A non-empty list makes
// the channel a MANUAL_ITEMS channel (takes priority over sources/filter).
const manualItemKeysSchema = z.array(z.string().min(1)).optional();

const conditionSchema = z.object({
  type: z.literal("condition"),
  id: z.string().optional(),
  field: z.string(),
  op: opEnum,
  value: z.string(),
});

type FilterNodeInput =
  | z.infer<typeof conditionSchema>
  | { type: "group"; id?: string; combinator: "and" | "or"; children: FilterNodeInput[] };

const nodeSchema: z.ZodType<FilterNodeInput> = z.lazy(() =>
  z.union([
    conditionSchema,
    z.object({
      type: z.literal("group"),
      id: z.string().optional(),
      combinator: z.enum(["and", "or"]),
      children: z.array(nodeSchema),
    }),
  ]),
);

// OPTIONAL bolt-on grouping/rotation strategy (§7.6 Arc 3). Mirrors `ChannelStrategy` in
// services/schedule/timeline.ts. `null` clears it (→ base ordering only).
const runSpecSchema = z.union([
  z.number(),
  z.tuple([z.number(), z.number()]),
  z.literal("all"),
  z.object({ minutes: z.tuple([z.number(), z.number()]) }),
]);
const strategySchema = z
  .object({
    rotation: z.enum(["clustered", "round_robin"]),
    rotationOrder: z.enum(["shuffle", "cycle"]).optional(),
    grouping: z
      .array(
        z.object({
          scope: z.enum(["show", "movie", "collection"]),
          run: runSpecSchema.optional(),
          filter: nodeSchema.optional(),
        }),
      )
      .min(1),
    constraints: z
      .object({
        noRepeatWithin: z
          .object({ minutes: z.number().optional(), count: z.number().optional() })
          .optional(),
      })
      .optional(),
  })
  .nullable();

export const channelsRouter = router({
  // Server-side search / filter / sort (the UI drives it via URL params). Input is optional so
  // no-arg callers (e.g. the watch page) still get the full list, number-ascending.
  list: adminProcedure
    .input(
      z
        .object({
          q: z.string().optional(),
          pkg: z.string().optional(), // a package id, or "none" for unassigned
          ordering: z.enum(["SHUFFLE", "IN_ORDER", "BY_AIR_DATE"]).optional(),
          status: z.enum(["active", "inactive"]).optional(),
          sort: z.enum(["number", "name", "callsign", "status", "package"]).optional(),
          dir: z.enum(["asc", "desc"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const q = input?.q?.trim();
      const pkg = input?.pkg;
      const sort = input?.sort ?? "number";
      const dir = input?.dir ?? "asc";

      const where: Prisma.ChannelWhereInput = {};
      if (q) {
        where.OR = [
          { name: { contains: q, mode: "insensitive" } },
          { callsign: { contains: q, mode: "insensitive" } },
        ];
      }
      if (pkg === "none") where.packageId = null;
      else if (pkg) where.packageId = pkg;
      if (input?.ordering) where.ordering = input.ordering;
      if (input?.status) where.enabled = input.status === "active";

      // Always fall back to number for a stable secondary order.
      const byNumber: Prisma.ChannelOrderByWithRelationInput = { number: "asc" };
      const orderBy: Prisma.ChannelOrderByWithRelationInput[] =
        sort === "name"
          ? [{ name: dir }, byNumber]
          : sort === "callsign"
            ? [{ callsign: dir }, byNumber]
            : sort === "status"
              ? [{ enabled: dir === "asc" ? "desc" : "asc" }, byNumber] // asc = active first
              : sort === "package"
                ? [{ package: { name: dir } }, byNumber]
                : [{ number: dir }];

      return ctx.prisma.channel.findMany({
        where,
        orderBy,
        select: {
          id: true,
          number: true,
          name: true,
          callsign: true,
          ordering: true,
          enabled: true,
          icon: true,
          tint: true,
          generated: true,
          aiGenerated: true,
          package: {
            select: {
              id: true,
              name: true,
              description: true,
              icon: true,
              tint: true,
              _count: { select: { channels: true } },
            },
          },
        },
      });
    }),

  get: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const channel = await ctx.prisma.channel.findUnique({
      where: { id: input.id },
      include: {
        definitions: { orderBy: { sortIndex: "asc" }, take: 1 },
        // For the header identity tile — a channel with no own icon/tint inherits the package's.
        package: { select: { icon: true, tint: true } },
      },
    });
    if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found." });
    const def = channel.definitions[0];
    const filter =
      (def?.plexFilter as unknown as {
        mediaTypes?: string[];
        filter?: FilterNodeInput;
      } | null) ?? {};
    return {
      id: channel.id,
      number: channel.number,
      name: channel.name,
      callsign: channel.callsign,
      ordering: channel.ordering,
      sortField: channel.sortField,
      sortDir: channel.sortDir,
      enabled: channel.enabled,
      bumperMode: channel.bumperMode,
      description: channel.description,
      mediaSourceId: channel.mediaSourceId,
      packageId: channel.packageId,
      icon: channel.icon,
      tint: channel.tint,
      generated: channel.generated,
      aiGenerated: channel.aiGenerated,
      packageIcon: channel.package?.icon ?? null,
      packageTint: channel.package?.tint ?? null,
      // How the pool is defined: PREDICATE (filter) or MEMBERSHIP (playlists/collections).
      kind: def?.kind ?? "PREDICATE",
      mediaTypes: filter.mediaTypes ?? ["movie", "show"],
      filter: filter.filter ?? null,
      sources:
        (def?.sources as unknown as { type: "playlist" | "collection"; key: string; title?: string }[] | null) ??
        null,
      manualItemKeys: def?.manualItemKeys ?? [],
      strategy: (channel.strategy as unknown) ?? null,
    };
  }),

  /**
   * Cross-channel guide grid: every enabled channel with its upcoming PROGRAM slots
   * over the window (currently-airing + next `forwardMinutes`), guide metadata merged.
   * One query for all channels. Bumpers are omitted (they're tiny interstitials).
   * The REST TV API mirrors this via the same `getGuideGrid` service.
   */
  guide: adminProcedure
    .input(z.object({ forwardMinutes: z.number().int().min(30).max(720).default(150) }))
    .query(({ ctx, input }) => getGuideGrid(ctx.prisma, input.forwardMinutes)),

  /** Sort options for a channel's ordering (Plex sort fields). */
  sortFields: adminProcedure.query(() =>
    SORT_FIELDS.map((s) => ({ field: s.field, label: s.label })),
  ),

  /** Static filter field catalog (field + label + kind + operators). */
  filterFields: adminProcedure.query(() =>
    FILTER_FIELDS.map((f) => ({
      field: f.field,
      label: f.label,
      kind: f.kind,
      operators: OPS_FOR_KIND[f.kind],
    })),
  ),

  /** Values for a tag field, unioned across the enabled libraries of the given types. */
  filterValues: adminProcedure
    .input(
      z.object({
        mediaSourceId: z.string(),
        mediaTypes: z.array(mediaTypeEnum),
        field: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const meta = fieldMeta(input.field);
      if (!meta?.tagId) return [];
      const source = await ctx.prisma.mediaSource.findUnique({
        where: { id: input.mediaSourceId },
      });
      if (!source?.baseUrl || input.mediaTypes.length === 0) return [];
      const libs = await ctx.prisma.mediaLibrary.findMany({
        where: { mediaSourceId: input.mediaSourceId, enabled: true, type: { in: input.mediaTypes } },
      });
      const titles = new Set<string>();
      for (const lib of libs) {
        const vals = await getFilterValues(source.baseUrl, decryptToken(source.token), lib.key, meta.plex);
        for (const v of vals) titles.add(v.title);
      }
      return [...titles].sort((a, b) => a.localeCompare(b));
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        callsign: z.string().nullish(),
        number: z.number().int().optional(),
        mediaSourceId: z.string(),
        mediaTypes: z.array(mediaTypeEnum).min(1),
        filter: nodeSchema.optional(),
        // MEMBERSHIP: when present + non-empty, the channel's pool is these playlists/collections (the
        // filter is ignored). Absent/empty → a PREDICATE (filter) channel, as before.
        sources: sourcesSchema,
        // MANUAL_ITEMS: hand-picked ratingKeys. Non-empty → MANUAL_ITEMS (takes priority).
        manualItemKeys: manualItemKeysSchema,
        ordering: orderingEnum.default("SHUFFLE"),
        strategy: strategySchema.optional(),
        sortField: z.string().optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
        packageId: z.string().nullish(),
        icon: z.string().nullish(),
        tint: z.string().nullish().transform((v) => (v ? toAccentKey(v) : null)), // coerce to a valid accent key
        description: z.string().nullish(),
        enabled: z.boolean().optional(),
        bumperMode: bumperModeEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Gate creation on source readiness — the ONE shared check (services/sources/readiness): a channel
      // can only be built from a CONNECTED source whose metadata SYNC has COMPLETED (syncStatus="synced").
      const readiness = await getSourceReadiness(ctx.prisma, input.mediaSourceId);
      if (!readiness) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media source not found." });
      }
      if (!readiness.ready) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: notReadyReason(readiness.fields, "create channels")! });
      }

      const number =
        input.number ??
        ((await ctx.prisma.channel.aggregate({ _max: { number: true } }))._max.number ?? 0) + 1;

      // Pick the definition kind by which data is present: manual items > membership sources > filter.
      const definition = input.manualItemKeys?.length
        ? { kind: "MANUAL_ITEMS" as const, manualItemKeys: input.manualItemKeys }
        : input.sources?.length
          ? { kind: "MEMBERSHIP" as const, sources: JSON.parse(JSON.stringify(input.sources)) as Prisma.InputJsonValue }
          : {
              kind: "PREDICATE" as const,
              plexFilter: {
                mediaTypes: input.mediaTypes,
                ...(input.filter ? { filter: JSON.parse(JSON.stringify(input.filter)) } : {}),
              },
            };

      const channel = await ctx.prisma.channel.create({
        data: {
          name: input.name,
          callsign: input.callsign ? normalizeCallsign(input.callsign) : null,
          number,
          mediaSourceId: input.mediaSourceId,
          ordering: input.ordering,
          strategy: input.strategy
            ? (JSON.parse(JSON.stringify(input.strategy)) as Prisma.InputJsonValue)
            : Prisma.DbNull,
          sortField: input.sortField ?? "title",
          sortDir: input.sortDir ?? "asc",
          packageId: input.packageId ?? null,
          icon: input.icon ?? null,
          tint: input.tint ?? null,
          description: input.description ?? null,
          enabled: input.enabled ?? true,
          bumperMode: input.bumperMode ?? "INHERIT",
          createdById: ctx.session.user.id,
          definitions: { create: definition },
        },
      });

      // Give the new channel a WINDOWED initial schedule inline — the same thing the AI lineup
      // builder does per channel — so it's watchable the moment it's created instead of waiting for
      // the next schedule-backfill run. The window caps it at ~12h (INITIAL_WINDOW_SECONDS) so a
      // broad pool doesn't lay a ~300-day pass up front; `schedule-refresh` then grows it from the
      // stored cursor. Best-effort: a build failure leaves the channel for schedule-backfill (which
      // picks up any enabled channel with no schedule) rather than failing the creation.
      if (channel.enabled) {
        try {
          await generateChannelSchedule(ctx.prisma, channel.id, {
            windowSeconds: INITIAL_WINDOW_SECONDS,
          });
        } catch (err) {
          console.warn(
            `[channels] initial schedule build failed for "${channel.name}" (backfill will retry):`,
            err,
          );
        }
      }

      return { id: channel.id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        callsign: z.string().nullish(),
        number: z.number().int(),
        mediaTypes: z.array(mediaTypeEnum).min(1),
        filter: nodeSchema.optional(),
        sources: sourcesSchema, // non-empty → MEMBERSHIP; absent/empty → PREDICATE (see create)
        manualItemKeys: manualItemKeysSchema, // non-empty → MANUAL_ITEMS (takes priority)
        ordering: orderingEnum,
        strategy: strategySchema.optional(),
        sortField: z.string().optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
        packageId: z.string().nullish(),
        icon: z.string().nullish(),
        tint: z.string().nullish().transform((v) => (v ? toAccentKey(v) : null)), // coerce to a valid accent key
        description: z.string().nullish(),
        enabled: z.boolean().optional(),
        bumperMode: bumperModeEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const channel = await ctx.prisma.channel.findUnique({
        where: { id: input.id },
        include: { definitions: { orderBy: { sortIndex: "asc" }, take: 1 } },
      });
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found." });

      await ctx.prisma.channel.update({
        where: { id: input.id },
        data: {
          name: input.name,
          callsign: input.callsign ? normalizeCallsign(input.callsign) : null,
          number: input.number,
          ordering: input.ordering,
          // `undefined` = field omitted from the payload (leave as-is); `null` = explicitly clear it.
          ...(input.strategy === undefined
            ? {}
            : {
                strategy: input.strategy
                  ? (JSON.parse(JSON.stringify(input.strategy)) as Prisma.InputJsonValue)
                  : Prisma.DbNull,
              }),
          sortField: input.sortField ?? "title",
          sortDir: input.sortDir ?? "asc",
          packageId: input.packageId ?? null,
          icon: input.icon ?? null,
          tint: input.tint ?? null,
          description: input.description ?? null,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.bumperMode ? { bumperMode: input.bumperMode } : {}),
        },
      });

      // Rewrite the single definition to the submitted source, by kind: manual items > membership > filter.
      // On any kind switch, clear the other kinds' columns so a stale filter / sources / manual list can't
      // leak into resolution (`manualItemKeys` is a scalar list → cleared with `[]`, not DbNull).
      const defData = input.manualItemKeys?.length
        ? {
            kind: "MANUAL_ITEMS" as const,
            manualItemKeys: input.manualItemKeys,
            plexFilter: Prisma.DbNull,
            sources: Prisma.DbNull,
          }
        : input.sources?.length
          ? {
              kind: "MEMBERSHIP" as const,
              sources: JSON.parse(JSON.stringify(input.sources)) as Prisma.InputJsonValue,
              plexFilter: Prisma.DbNull,
              manualItemKeys: [],
            }
          : {
              kind: "PREDICATE" as const,
              plexFilter: {
                mediaTypes: input.mediaTypes,
                ...(input.filter ? { filter: JSON.parse(JSON.stringify(input.filter)) } : {}),
              } as Prisma.InputJsonValue,
              sources: Prisma.DbNull,
              manualItemKeys: [],
            };
      const def = channel.definitions[0];
      if (def) {
        await ctx.prisma.channelDefinition.update({ where: { id: def.id }, data: defData });
      } else {
        await ctx.prisma.channelDefinition.create({ data: { channelId: input.id, ...defData } });
      }

      // A bumper-mode change immediately kicks off the reconcile job to repair this
      // channel's schedule (add/remove breaks). No-ops if nothing turns out stale.
      if (input.bumperMode && input.bumperMode !== channel.bumperMode) {
        void runJob("schedule-bumper-sync");
      }
      return { ok: true };
    }),

  /** Resolve a channel's candidate pool — count + a title sample. */
  resolve: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const items = await resolveChannel(ctx.prisma, input.id, { includeStreams: false });
    return { count: items.length, sample: items.slice(0, 8).map((i) => i.title) };
  }),

  /**
   * Rich preview of a saved channel's pool: full PlexItems with a show's episodes coalesced up into the
   * show (+ episode/season counts), movies passed through. Powers the channel page's artwork tiles.
   */
  preview: adminProcedure
    .input(z.object({ id: z.string(), detail: z.enum(["quick", "default", "verbose"]).optional() }))
    .query(async ({ ctx, input }) => {
      const channel = await ctx.prisma.channel.findUnique({ where: { id: input.id }, select: { mediaSourceId: true } });
      if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
      // Poster-grid preview: skip the per-file Stream tree and use the lean `tiles` projection.
      const items = await resolveChannel(ctx.prisma, input.id, { includeStreams: false });
      return previewItems(ctx.prisma, channel.mediaSourceId, items, input.detail ?? "tiles");
    }),

  /**
   * Preview an UNSAVED filter tree — resolves an ad-hoc filter (whatever's currently in the builder) against
   * the source, returning the same coalesced shape as `preview`. Lets the channel editor show what the current
   * conditions catch WITHOUT saving first (GitHub #12), and powers the create page's pre-save preview. Reuses
   * the same recursive `nodeSchema` the save mutations validate against.
   */
  previewFilter: adminProcedure
    .input(
      z.object({
        mediaSourceId: z.string(),
        mediaTypes: z.array(mediaTypeEnum).min(1),
        filter: nodeSchema.optional(),
        sortField: z.string().optional(),
        sortDir: z.enum(["asc", "desc"]).optional(),
        detail: z.enum(["quick", "default", "verbose"]).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      resolvePreviewFilter(ctx.prisma, {
        mediaSourceId: input.mediaSourceId,
        mediaTypes: input.mediaTypes,
        filter: input.filter,
        sortField: input.sortField,
        sortDir: input.sortDir,
        // The channel builder's preview is a poster grid (no codec/HDR/audio badges), so skip the heavy
        // per-file Stream tree and return the lean `tiles` projection — same as the preset preview.
        detail: input.detail ?? "tiles",
        includeStreams: false,
      }),
    ),

  /** The source's video playlists, for the membership picker (title + item count + smart badge). */
  playlists: adminProcedure
    .input(z.object({ mediaSourceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const source = await ctx.prisma.mediaSource.findUnique({ where: { id: input.mediaSourceId } });
      if (!source?.baseUrl) return [];
      return getPlaylists(source.baseUrl, decryptToken(source.token));
    }),

  /**
   * The source's collections, for the membership picker — aggregated across its enabled movie/show
   * libraries (collections are per-library), each tagged with its library title so the picker can group.
   */
  collections: adminProcedure
    .input(z.object({ mediaSourceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const source = await ctx.prisma.mediaSource.findUnique({ where: { id: input.mediaSourceId } });
      if (!source?.baseUrl) return [];
      const token = decryptToken(source.token);
      const libs = await ctx.prisma.mediaLibrary.findMany({
        where: { mediaSourceId: input.mediaSourceId, enabled: true, type: { in: ["movie", "show"] } },
        select: { key: true, title: true, type: true },
      });
      const out: Array<{ key: string; title: string; childCount: number; smart: boolean; library: string; libraryType: string }> = [];
      for (const lib of libs) {
        const cols = await getCollections(source.baseUrl, token, lib.key);
        for (const c of cols) out.push({ ...c, library: lib.title, libraryType: lib.type });
      }
      return out;
    }),

  /**
   * Preview an UNSAVED membership source — resolves the chosen playlists/collections into the same
   * coalesced shape as `preview`, so the editor can show the combined pool before saving.
   */
  previewMembership: adminProcedure
    .input(
      z.object({
        mediaSourceId: z.string(),
        sources: z.array(membershipSourceSchema),
        detail: z.enum(["quick", "default", "verbose"]).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      resolvePreviewMembership(ctx.prisma, {
        mediaSourceId: input.mediaSourceId,
        sources: input.sources,
        detail: input.detail,
      }),
    ),

  /** Manual-mode search over the MediaItem cache — movies / shows / episodes matching a title query. */
  searchMedia: adminProcedure
    .input(
      z.object({
        mediaSourceId: z.string(),
        query: z.string(),
        types: z.array(z.enum(["movie", "show", "episode"])).min(1),
      }),
    )
    .query(({ ctx, input }) =>
      searchMediaService(ctx.prisma, {
        mediaSourceId: input.mediaSourceId,
        query: input.query,
        types: input.types,
      }),
    ),

  /** A show's episodes grouped by season, for the Manual-mode drill-down (cache-only). */
  showEpisodes: adminProcedure
    .input(z.object({ mediaSourceId: z.string(), showRatingKey: z.string() }))
    .query(({ ctx, input }) =>
      showEpisodesService(ctx.prisma, { mediaSourceId: input.mediaSourceId, showRatingKey: input.showRatingKey }),
    ),

  /** Label a set of hand-picked ratingKeys (cache lookup) so the Manual builder can render a saved pool. */
  itemsByKeys: adminProcedure
    .input(z.object({ mediaSourceId: z.string(), keys: z.array(z.string()) }))
    .query(({ ctx, input }) => itemLabelsService(ctx.prisma, { mediaSourceId: input.mediaSourceId, keys: input.keys })),

  /** Preview an UNSAVED manual pool — resolves hand-picked ratingKeys into the coalesced preview shape. */
  previewManual: adminProcedure
    .input(
      z.object({
        mediaSourceId: z.string(),
        itemKeys: z.array(z.string()),
        detail: z.enum(["quick", "default", "verbose"]).optional(),
      }),
    )
    .query(({ ctx, input }) =>
      resolvePreviewManual(ctx.prisma, {
        mediaSourceId: input.mediaSourceId,
        itemKeys: input.itemKeys,
        detail: input.detail,
      }),
    ),

  /**
   * Rebuild the channel's whole lineup from now (one full pass minimum, looped to a
   * ~7-day floor). Replaces the timeline — use after the filter/pool changed.
   */
  generateSchedule: adminProcedure
    .input(z.object({ id: z.string(), minHorizonHours: z.number().int().min(1).max(1440).optional() }))
    .mutation(async ({ ctx, input }) => {
      return generateChannelSchedule(ctx.prisma, input.id, {
        minDurationSeconds: input.minHorizonHours ? input.minHorizonHours * 3600 : undefined,
      });
    }),

  /** Append a fresh block at the tail when the schedule is running low (non-disruptive). */
  extendSchedule: adminProcedure
    .input(z.object({ id: z.string(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      return extendChannelSchedule(ctx.prisma, input.id, { force: input.force });
    }),

  /** The materialized timeline over a window (default: next 24h) for the guide grid. */
  schedule: adminProcedure
    .input(z.object({ id: z.string(), hours: z.number().int().min(1).max(1440).default(24) }))
    .query(async ({ ctx, input }) => {
      const from = new Date();
      const to = new Date(from.getTime() + input.hours * 3600 * 1000);
      return getChannelTimeline(ctx.prisma, input.id, from, to);
    }),

  /** "What's on now" (+ live offset) and what's next, from the materialized timeline. */
  nowNext: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    return getNowNext(ctx.prisma, input.id);
  }),

  /** Quick active/inactive toggle — inactive channels aren't selectable in the guide. */
  setEnabled: adminProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.channel.update({
        where: { id: input.id },
        data: { enabled: input.enabled },
      });
      return { ok: true };
    }),

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.channel.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
