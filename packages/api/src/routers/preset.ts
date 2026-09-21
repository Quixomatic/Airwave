import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, router } from "../index";
import { type PresetChannelOp, getPresetCatalog, planPresetBuild } from "../services/generator/plan";
import { PRESET_CHANNELS_BY_KEY } from "../services/generator/presets";
import { previewFilter } from "../services/agent/tools";

/** Resolve the target media source: the given id, or the first enabled source. */
async function resolveSourceId(
  prisma: Parameters<typeof getPresetCatalog>[0],
  sourceId?: string,
): Promise<string> {
  if (sourceId) return sourceId;
  const source = await prisma.mediaSource.findFirst({ where: { enabled: true }, select: { id: true } });
  if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "No connected source." });
  return source.id;
}

const selectionSchema = z.object({ channelKeys: z.array(z.string()) });

/** Trim a diff op to the fields the confirm dialog / staging summary render. */
const toSummary = (op: PresetChannelOp) => ({
  channelKey: op.channelKey,
  channelName: op.channelName,
  packageKey: op.packageKey,
  packageName: op.packageName,
  number: op.number,
});

export const presetRouter = router({
  /**
   * The full preset catalog annotated with each channel's diff state (exists / presetChanged), so the staging
   * grid can render package cards + New/Update/Unchanged/Remove badges before resolving any filter.
   */
  catalog: adminProcedure
    .input(z.object({ sourceId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sourceId = await resolveSourceId(ctx.prisma, input?.sourceId);
      return { sourceId, packages: await getPresetCatalog(ctx.prisma, sourceId) };
    }),

  /**
   * A single disposable, EXACT preview of one preset channel — one real `resolveFilter` yielding the exact
   * count (card) and the poster-tile artwork (hover). Nothing is persisted. Called per enabled card with
   * bounded client concurrency. TV counts are episode-level, matching `minItems`.
   */
  preview: adminProcedure
    .input(
      z.object({
        channelKey: z.string(),
        sourceId: z.string().optional(),
        detail: z.enum(["quick", "default", "verbose"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const entry = PRESET_CHANNELS_BY_KEY.get(input.channelKey);
      if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: `Unknown preset channel "${input.channelKey}".` });
      const sourceId = await resolveSourceId(ctx.prisma, input.sourceId);
      const ch = entry.channel;
      const result = await previewFilter(ctx.prisma, {
        mediaSourceId: sourceId,
        mediaTypes: ch.mediaTypes,
        filter: ch.filter,
        sortField: ch.sortField,
        sortDir: ch.sortDir,
        detail: input.detail ?? "default",
      });
      return {
        count: result.totalItems,
        showCount: result.showCount,
        movieCount: result.movieCount,
        items: result.items,
        minItems: ch.minItems,
      };
    }),

  /**
   * The net-outcome plan for a selection: the create / update / delete / unchanged tallies + lists that back
   * the confirm dialog before submit. A thin wrapper over the diff engine (the same one the build runs).
   */
  plan: adminProcedure
    .input(z.object({ selection: selectionSchema, sourceId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const sourceId = await resolveSourceId(ctx.prisma, input.sourceId);
      const plan = await planPresetBuild(ctx.prisma, sourceId, { selection: input.selection });
      return {
        sourceId,
        counts: {
          create: plan.create.length,
          update: plan.update.length,
          delete: plan.delete.length,
          unchanged: plan.unchanged.length,
        },
        create: plan.create.map(toSummary),
        update: plan.update.map(toSummary),
        delete: plan.delete.map(toSummary),
      };
    }),
});
