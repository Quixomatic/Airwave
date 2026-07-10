import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { getSectionGenres } from "../services/plex/client";
import { resolveChannel } from "../services/plex/resolve";

const orderingEnum = z.enum(["SHUFFLE", "IN_ORDER", "BY_AIR_DATE"]);
const mediaTypeEnum = z.enum(["movie", "show"]);

export const channelsRouter = router({
  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.channel.findMany({
      orderBy: { number: "asc" },
      select: { id: true, number: true, name: true, ordering: true, enabled: true },
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
        genreTitle?: string;
        unwatched?: boolean;
      } | null) ?? {};
    return {
      id: channel.id,
      number: channel.number,
      name: channel.name,
      ordering: channel.ordering,
      mediaSourceId: channel.mediaSourceId,
      mediaTypes: filter.mediaTypes ?? ["movie", "show"],
      genreTitle: filter.genreTitle ?? "",
      unwatched: filter.unwatched ?? false,
    };
  }),

  /** Union of genre titles across the enabled libraries of the given types. */
  contentGenres: adminProcedure
    .input(z.object({ mediaSourceId: z.string(), mediaTypes: z.array(mediaTypeEnum) }))
    .query(async ({ ctx, input }) => {
      const source = await ctx.prisma.mediaSource.findUnique({
        where: { id: input.mediaSourceId },
      });
      if (!source?.baseUrl || input.mediaTypes.length === 0) return [];
      const libs = await ctx.prisma.mediaLibrary.findMany({
        where: { mediaSourceId: input.mediaSourceId, enabled: true, type: { in: input.mediaTypes } },
      });
      const titles = new Set<string>();
      for (const lib of libs) {
        const genres = await getSectionGenres(source.baseUrl, source.token, lib.key);
        for (const g of genres) titles.add(g.title);
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
        genreTitle: z.string().optional(),
        unwatched: z.boolean().optional(),
        ordering: orderingEnum.default("SHUFFLE"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const number =
        input.number ??
        ((await ctx.prisma.channel.aggregate({ _max: { number: true } }))._max.number ?? 0) + 1;

      const channel = await ctx.prisma.channel.create({
        data: {
          name: input.name,
          number,
          mediaSourceId: input.mediaSourceId,
          ordering: input.ordering,
          createdById: ctx.session.user.id,
          definitions: {
            create: {
              kind: "PREDICATE",
              plexFilter: {
                mediaTypes: input.mediaTypes,
                unwatched: input.unwatched ?? false,
                ...(input.genreTitle ? { genreTitle: input.genreTitle } : {}),
              },
            },
          },
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
        genreTitle: z.string().optional(),
        unwatched: z.boolean().optional(),
        ordering: orderingEnum,
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
        data: { name: input.name, number: input.number, ordering: input.ordering },
      });

      const plexFilter = {
        mediaTypes: input.mediaTypes,
        unwatched: input.unwatched ?? false,
        ...(input.genreTitle ? { genreTitle: input.genreTitle } : {}),
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

  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.channel.delete({ where: { id: input.id } });
    return { ok: true };
  }),
});
