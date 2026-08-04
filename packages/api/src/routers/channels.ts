import { Prisma } from "@ChannelGuide/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { toAccentKey } from "../services/accents";
import { getGuideGrid } from "../services/guide";
import { runJob } from "../services/jobs/scheduler";
import { getFilterValues } from "../services/plex/client";
import { FILTER_FIELDS, OPS_FOR_KIND, fieldMeta } from "../services/plex/filter-fields";
import { resolveChannel } from "../services/plex/resolve";
import { previewItems } from "../services/agent/tools";
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
const opEnum = z.enum(["is", "isNot", "gte", "lte", "contains", "notContains"]);

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
          package: { select: { id: true, name: true, icon: true, tint: true } },
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
      packageIcon: channel.package?.icon ?? null,
      packageTint: channel.package?.tint ?? null,
      mediaTypes: filter.mediaTypes ?? ["movie", "show"],
      filter: filter.filter ?? null,
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
        const vals = await getFilterValues(source.baseUrl, source.token, lib.key, meta.plex);
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
      // Gate creation on source readiness (also enforced in the UI): a channel can only be built
      // from a source that's CONNECTED to a media server and has had a metadata SYNC run — without
      // synced media there's nothing to resolve, filter, or schedule against.
      const source = await ctx.prisma.mediaSource.findUnique({
        where: { id: input.mediaSourceId },
        select: { enabled: true, baseUrl: true, _count: { select: { mediaItems: true } } },
      });
      if (!source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Media source not found." });
      }
      if (!source.enabled || !source.baseUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This media source isn't connected to a media server. Connect it before creating channels.",
        });
      }
      if (source._count.mediaItems === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Run a metadata sync on this source before creating channels — there's no synced media to build from yet.",
        });
      }

      const number =
        input.number ??
        ((await ctx.prisma.channel.aggregate({ _max: { number: true } }))._max.number ?? 0) + 1;

      const plexFilter = {
        mediaTypes: input.mediaTypes,
        ...(input.filter ? { filter: JSON.parse(JSON.stringify(input.filter)) } : {}),
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
          definitions: { create: { kind: "PREDICATE", plexFilter } },
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

      const plexFilter = {
        mediaTypes: input.mediaTypes,
        ...(input.filter ? { filter: JSON.parse(JSON.stringify(input.filter)) } : {}),
      };
      const def = channel.definitions[0];
      if (def) {
        await ctx.prisma.channelDefinition.update({
          where: { id: def.id },
          data: { plexFilter },
        });
      } else {
        await ctx.prisma.channelDefinition.create({
          data: { channelId: input.id, kind: "PREDICATE", plexFilter },
        });
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
    const items = await resolveChannel(ctx.prisma, input.id);
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
      const items = await resolveChannel(ctx.prisma, input.id);
      return previewItems(ctx.prisma, channel.mediaSourceId, items, input.detail ?? "default");
    }),

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
