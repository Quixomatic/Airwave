import type { PrismaClient } from "@airwave/db";

import { type PlexItem, getFilterValues, getSectionItemsRaw } from "./client";
import { type FilterCondition, type FilterNode, buildParam, fieldMeta } from "./filter-fields";
import type { ResolveSource } from "./resolve";

/**
 * EXPERIMENTAL v2 filter resolver — one Plex query per enabled library using Plex's advanced-filter grammar
 * (`advancedFilters=1` + `push`/`or`/`pop`), instead of the fan-out-and-combine approach in `resolve.ts`.
 *
 * This file is standalone and touches nothing in `resolve.ts`: the live `resolveFilter` keeps working exactly
 * as today. `resolveFilterAdvanced` is result-equivalent (verified by `scripts/probe-resolve-diff.ts`, which
 * diffs the ratingKey sets channel by channel) and collapses OR / nested filters from N queries to 1. Once the
 * diff probe is clean across the catalog and it's measurably faster, `resolveFilter` gets routed through this.
 *
 * Grammar (from the Plex OpenAPI spec, `.docs/openapi/plex.tv.json`):
 *   - Multiple params are ANDed by default ("ANDs of ORs"); AND needs no token.
 *   - `or=1` between operands = explicit OR.
 *   - `push=1` / `pop=1` = open / close a group (parens), nestable.
 *   - Per-condition syntax (`field<op>value`, tag ids, `show.`/`episode.` prefixes, `%3D=` exact) is unchanged
 *     from `buildParam` — only the ASSEMBLY differs. `advancedFilters=1` is added only when a grouping token
 *     is actually present, so a pure-AND filter stays byte-identical to today's query.
 */

type LibCtx = {
  baseUrl: string;
  token: string;
  sectionKey: string;
  type: 1 | 4;
  tv: boolean;
  sort: string;
  tagCache: Map<string, Promise<Map<string, string>>>;
  includeStreams: boolean;
};

async function resolveTag(ctx: LibCtx, plexField: string, title: string): Promise<string | undefined> {
  let p = ctx.tagCache.get(plexField);
  if (!p) {
    p = getFilterValues(ctx.baseUrl, ctx.token, ctx.sectionKey, plexField).then(
      (vals) => new Map(vals.map((v) => [v.title.toLowerCase(), v.id])),
    );
    ctx.tagCache.set(plexField, p);
  }
  return (await p).get(title.toLowerCase());
}

const NEGATION_OPS = new Set(["isNot", "notContains", "notEquals"]);
const isNegation = (c: FilterCondition) => NEGATION_OPS.has(c.op);

/** Does this field resolve at all in this library type? (Matches `resolve.ts`.) */
function fieldApplies(field: string, libType: "movie" | "show"): boolean {
  const meta = fieldMeta(field);
  if (!meta) return false;
  return !meta.appliesTo || meta.appliesTo.includes(libType);
}

/**
 * A translated node: an ordered param sequence, or one of two sentinels mirroring `resolve.ts`'s semantics:
 *   - "drop": this predicate/group can't be evaluated here (inapplicable field, or absent-value negation);
 *     ignore it in its parent, exactly like the live resolver drops it.
 *   - "none": a positive match on an absent value → matches nothing (a real FALSE). In an AND that makes the
 *     whole group "none"; in an OR it contributes nothing; at the top it means the library returns zero.
 */
type Adv = { params: string[] } | "drop" | "none";

async function buildAdvancedFilter(node: FilterNode, ctx: LibCtx): Promise<Adv> {
  const libType = ctx.tv ? ("show" as const) : ("movie" as const);
  const opts = { libType };

  if (node.type === "condition") {
    if (!fieldApplies(node.field, libType)) return "drop";
    const param = await buildParam(node, (f, t) => resolveTag(ctx, f, t), opts);
    if (!param) return isNegation(node) ? "drop" : "none";
    return { params: [param] };
  }

  // Build each child, applying the same drop/none rules the live resolver uses.
  const operands: string[][] = [];
  let sawNone = false;
  for (const child of node.children) {
    const r = await buildAdvancedFilter(child, ctx);
    if (r === "drop") continue;
    if (r === "none") {
      if (node.combinator === "and") return "none"; // AND with an impossible predicate → nothing
      sawNone = true; // OR: contributes nothing
      continue;
    }
    // A group operand is wrapped in push/pop so its internal joiners don't leak into the parent sequence.
    operands.push(child.type === "group" ? ["push=1", ...r.params, "pop=1"] : r.params);
  }
  if (operands.length === 0) return sawNone ? "none" : "drop";

  const out: string[] = [];
  operands.forEach((op, i) => {
    if (i > 0 && node.combinator === "or") out.push("or=1"); // AND is the implicit default (no token)
    out.push(...op);
  });
  return { params: out };
}

/**
 * v2 of {@link import("./resolve").resolveFilter} — same signature and result set, one query per enabled
 * library. Loops the source's enabled libraries of the chosen media types (movies type=1, TV type=4 episodes),
 * translates the whole tree once per library, and issues a single advanced-filter query.
 */
export async function resolveFilterAdvanced(
  prisma: PrismaClient,
  source: ResolveSource,
  mediaTypes: string[],
  tree: FilterNode | undefined,
  sort: string,
  opts: { includeStreams?: boolean } = {},
): Promise<PlexItem[]> {
  const libs = await prisma.mediaLibrary.findMany({
    where: { mediaSourceId: source.id, enabled: true, type: { in: mediaTypes } },
  });

  const out = new Map<string, PlexItem>();
  for (const lib of libs) {
    const isShow = lib.type !== "movie";
    const ctx: LibCtx = {
      baseUrl: source.baseUrl,
      token: source.token,
      sectionKey: lib.key,
      type: isShow ? 4 : 1,
      tv: isShow,
      sort,
      tagCache: new Map(),
      includeStreams: opts.includeStreams ?? true,
    };

    const adv = tree ? await buildAdvancedFilter(tree, ctx) : ({ params: [] } as Adv);
    // A real filter that resolves to "none" (impossible) OR "drop" (no gate it can apply here, e.g. a TV-only
    // field on the movie library) means this library contributes NOTHING. Only a genuinely absent tree (no
    // filter at all) falls through to an empty param list = the whole library pool.
    if (adv === "none" || adv === "drop") continue;
    const params = adv.params;
    // `advancedFilters=1` only when we actually emitted a grouping token; a pure-AND query stays identical to
    // the live resolver's (a plain `&`-joined param list), which keeps the common case byte-for-byte the same.
    const grouped = params.some((p) => p === "push=1" || p === "or=1");
    const finalParams = grouped ? ["advancedFilters=1", ...params] : params;

    const items = await getSectionItemsRaw(
      ctx.baseUrl,
      ctx.token,
      ctx.sectionKey,
      ctx.type,
      finalParams,
      ctx.sort,
      800,
      ctx.includeStreams,
    );
    for (const it of items) out.set(it.ratingKey, it);
  }
  return [...out.values()];
}

/** Exposed for the diff probe: the translated param sequence for a tree in a given library type (no query). */
export async function debugAdvancedParams(
  tree: FilterNode,
  ctx: { tv: boolean; baseUrl: string; token: string; sectionKey: string },
): Promise<Adv> {
  return buildAdvancedFilter(tree, {
    ...ctx,
    type: ctx.tv ? 4 : 1,
    sort: "titleSort",
    tagCache: new Map(),
    includeStreams: false,
  });
}
