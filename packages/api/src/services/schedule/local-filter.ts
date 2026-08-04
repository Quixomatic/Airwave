import type { PlexItem } from "../plex/client";
import type { FilterCondition, FilterNode } from "../plex/filter-fields";

/**
 * Evaluate a channel FilterNode tree LOCALLY against a pool item's cached metadata (`PlexItem.guide`) — for the
 * per-grouping strategy filter (§7.6 Arc 3). Unlike the channel-content filter (resolved against Plex's API to
 * BUILD the pool), a grouping filter narrows the ALREADY-resolved pool, so it runs on local metadata with no
 * network. It supports the subset of `FILTER_FIELDS` our `GuideMeta` holds; a field we don't cache (or a
 * malformed node) is treated as non-matching so a rule never over-claims. Pure + deterministic (time-relative
 * fields like "added within N days" are intentionally NOT supported here — they'd break determinism).
 */
export function matchesLocalFilter(item: PlexItem, node: FilterNode | null | undefined): boolean {
  if (!node || typeof node !== "object") return true; // no filter → the rule claims by scope alone
  if (node.type === "group") {
    if (!Array.isArray(node.children) || node.children.length === 0) return true;
    return node.combinator === "or"
      ? node.children.some((c) => matchesLocalFilter(item, c))
      : node.children.every((c) => matchesLocalFilter(item, c));
  }
  if (node.type === "condition") return matchCondition(item, node);
  return true;
}

function matchCondition(item: PlexItem, c: FilterCondition): boolean {
  const g = item.guide;
  const v = (c.value ?? "").toLowerCase();
  const contains = (s?: string) => (s ?? "").toLowerCase().includes(v);
  const eq = (s?: string) => (s ?? "").toLowerCase() === v;
  const inList = (arr?: string[]) => (arr ?? []).some((x) => x.toLowerCase() === v);
  const year = item.year ?? g.year;
  const n = Number(c.value);

  const text = (hit: boolean) => (c.op === "notContains" ? !hit : hit);
  const tag = (hit: boolean) => (c.op === "isNot" ? !hit : hit);
  const int = (actual: number | undefined) => {
    if (actual == null || Number.isNaN(n)) return false;
    if (c.op === "gte") return actual >= n;
    if (c.op === "lte") return actual <= n;
    if (c.op === "isNot") return actual !== n;
    return actual === n;
  };
  const bool = (actual: boolean) => actual === (c.value !== "false" && c.value !== "0");
  const date = (iso?: string) => {
    if (!iso) return false;
    const a = Date.parse(iso);
    const b = Date.parse(c.value);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return c.op === "lte" ? a <= b : a >= b;
  };

  switch (c.field) {
    case "title":
      return text(contains(item.title) || contains(g.showTitle));
    case "episodeTitle":
      return text(contains(item.title));
    case "genre":
      return tag(inList(g.genres));
    case "director":
      return tag(inList(g.directors));
    case "actor":
      return tag(inList(g.cast));
    case "studio":
      return tag(eq(g.studio));
    case "contentRating":
      return tag(eq(g.contentRating));
    case "resolution":
      return tag(eq(g.resolution));
    case "year":
    case "episodeYear":
      return int(year);
    case "decade":
      return int(year != null ? Math.floor(year / 10) * 10 : undefined);
    case "audienceRating":
      return int(g.audienceRating);
    case "criticRating":
      return int(g.criticRating);
    case "duration":
      return int(item.durationMs ? item.durationMs / 60000 : undefined); // minutes
    case "hdr":
      return bool(g.hdr != null);
    case "dovi":
      return bool(g.dovi != null);
    case "releaseDate":
      return date(item.originallyAvailableAt);
    default:
      return false; // field not in our local metadata cache → don't claim it
  }
}

/** The locally-evaluable field keys — the admin filter builder restricts a grouping filter to these, so it
 *  only offers fields that actually work against the cached pool metadata. */
export const LOCAL_FILTER_FIELDS = new Set([
  "title",
  "episodeTitle",
  "genre",
  "director",
  "actor",
  "studio",
  "contentRating",
  "resolution",
  "year",
  "episodeYear",
  "decade",
  "audienceRating",
  "criticRating",
  "duration",
  "hdr",
  "dovi",
  "releaseDate",
]);
