import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { getFilterValues } from "../services/plex/client";
import { FILTER_FIELDS, OPS_FOR_KIND, fieldMeta } from "../services/plex/filter-fields";
import { resolveChannel } from "../services/plex/resolve";
import {
  extendChannelSchedule,
  generateChannelSchedule,
  getChannelTimeline,
  getNowNext,
} from "../services/schedule/generate";

const orderingEnum = z.enum(["SHUFFLE", "IN_ORDER", "BY_AIR_DATE"]);
const mediaTypeEnum = z.enum(["movie", "show"]);
const opEnum = z.enum(["is", "isNot", "gte", "lte"]);

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

export const channelsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.channel.findMany({
      orderBy: { number: "asc" },
      select: {
        id: true,
        number: true,
        name: true,
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
      include: { definitions: { orderBy: { sortIndex: "asc" }, take: 1 } },
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
      ordering: channel.ordering,
      mediaSourceId: channel.mediaSourceId,
      packageId: channel.packageId,
      icon: channel.icon,
      tint: channel.tint,
      mediaTypes: filter.mediaTypes ?? ["movie", "show"],
      filter: filter.filter ?? null,
    };
  }),

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
        number: z.number().int().optional(),
        mediaSourceId: z.string(),
        mediaTypes: z.array(mediaTypeEnum).min(1),
        filter: nodeSchema.optional(),
        ordering: orderingEnum.default("SHUFFLE"),
        packageId: z.string().nullish(),
        icon: z.string().nullish(),
        tint: z.string().nullish(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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
          number,
          mediaSourceId: input.mediaSourceId,
          ordering: input.ordering,
          packageId: input.packageId ?? null,
          icon: input.icon ?? null,
          tint: input.tint ?? null,
          createdById: ctx.session.user.id,
          definitions: { create: { kind: "PREDICATE", plexFilter } },
        },
      });
      return { id: channel.id };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1),
        number: z.number().int(),
        mediaTypes: z.array(mediaTypeEnum).min(1),
        filter: nodeSchema.optional(),
        ordering: orderingEnum,
        packageId: z.string().nullish(),
        icon: z.string().nullish(),
        tint: z.string().nullish(),
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
          number: input.number,
          ordering: input.ordering,
          packageId: input.packageId ?? null,
          icon: input.icon ?? null,
          tint: input.tint ?? null,
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
      return { ok: true };
    }),

  /** Resolve a channel's candidate pool — count + a title sample. */
  resolve: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const items = await resolveChannel(ctx.prisma, input.id);
    return { count: items.length, sample: items.slice(0, 8).map((i) => i.title) };
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

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.channel.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
