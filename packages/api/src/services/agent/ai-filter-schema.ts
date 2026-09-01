import { z } from "zod";

import { FILTER_OPS, type FilterNode } from "../plex/filter-fields";

/**
 * The filter-tree schema we hand to the AI for tool inputs (`preview_filter`, channel create/commit).
 *
 * Two deliberate departures from the resolver's fully-recursive `FilterNode`:
 *
 * 1. **Non-recursive — capped at one level of nesting.** The real model is a recursive tree, but the
 *    only authoring surfaces (the admin filter-builder and the AI planner in `lineup-plan.ts`) cap
 *    grouping at one level to mirror Plex's UI: a top-level all/any holding conditions and one level of
 *    sub-groups, and a sub-group holds only conditions. The resolver still accepts any depth; nothing
 *    authors deeper. Describing this recursively (`z.lazy` → JSON Schema `anyOf` + self-`$ref`) is what
 *    breaks local models: on OpenAI-compatible servers with `tool_choice: "auto"` (a free-form tool-call
 *    parser, not guided decoding) the circular `$ref` makes the model serialize the nested `filter` as a
 *    JSON **string** — `AI_TypeValidationError: expected object, received string` (GitHub #3). A flat,
 *    concrete schema has no `$ref` to trip on and matches what the planner already does.
 *
 * 2. **String-tolerant.** Even without the `$ref`, some local models still emit the filter as a JSON
 *    string. So the field accepts an object OR a JSON string, parses the string, and re-validates it
 *    against the same tree. Cloud models send an object (first branch) and are unaffected.
 *
 * `op` is `z.enum(FILTER_OPS)` — the single source of truth for operators (`filter-fields.ts`), matching
 * the other agent/router schemas. Groups combine with `combinator`; conditions compare with `op` — the
 * resolver reads `node.combinator` and silently falls back to AND when it's absent, so a group must always
 * carry `combinator` (see the note in `lineup-plan.ts`). Returns a clean `z.ZodType<FilterNode>` so the
 * inferred tool-set type stays nameable (the `.transform` below is otherwise un-nameable across packages).
 */
export function aiFilterSchema(): z.ZodType<FilterNode> {
  const condition = z.object({
    type: z.literal("condition"),
    field: z.string(),
    op: z.enum(FILTER_OPS),
    value: z.string(),
  });
  // A group one level down: conditions ONLY — no further nesting.
  const innerGroup = z.object({
    type: z.literal("group"),
    combinator: z.enum(["and", "or"]),
    children: z.array(condition).min(1),
  });
  // Top level: a single condition, or a group of conditions and one-level groups.
  const tree = z.union([
    condition,
    z.object({
      type: z.literal("group"),
      combinator: z.enum(["and", "or"]),
      children: z.array(z.union([condition, innerGroup])).min(1),
    }),
  ]);

  // Accept the object OR a stringified version; the transform parses + re-validates a string against the
  // same tree so `execute` always receives a real object. Kept as a union (not z.preprocess) so the
  // model-facing JSON Schema is a clean `anyOf: [tree, string]` with no recursion.
  const schema = z.union([tree, z.string()]).transform((value, ctx) => {
    if (typeof value !== "string") return value;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      ctx.addIssue("filter was a string but not valid JSON");
      return z.NEVER;
    }
    const result = tree.safeParse(parsed);
    if (!result.success) {
      ctx.addIssue("filter (parsed from a string) is not a valid filter tree");
      return z.NEVER;
    }
    return result.data;
  });

  // The one-level tree is a structural subset of the recursive `FilterNode`; every value it produces is a
  // valid FilterNode. The cast gives callers the clean named type without widening what the schema accepts.
  return schema as unknown as z.ZodType<FilterNode>;
}
