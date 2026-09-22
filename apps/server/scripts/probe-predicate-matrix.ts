/**
 * Comprehensive v1-vs-v2 predicate matrix. Runs a battery of synthetic filter shapes (single condition, AND,
 * OR, nested, deep nesting, negations, absent values, movie-only / TV-only fields on a `both` channel, ranges,
 * recency, booleans) through BOTH resolvers and diffs the ratingKey sets. Every row must MATCH.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-predicate-matrix.ts
 */
import prisma from "@airwave/db";

import type { FilterCondition, FilterNode, FilterOp } from "@airwave/api/services/plex/filter-fields";
import { resolveFilter } from "@airwave/api/services/plex/resolve";
import { decryptToken } from "@airwave/api/services/plex/token";

const cond = (field: string, op: FilterOp, value: string): FilterCondition => ({ type: "condition", field, op, value });
const and = (...c: FilterNode[]): FilterNode => ({ type: "group", combinator: "and", children: c });
const or = (...c: FilterNode[]): FilterNode => ({ type: "group", combinator: "or", children: c });
const g = (v: string) => cond("genre", "is", v);
const ng = (v: string) => cond("genre", "isNot", v);
const r = (v: string) => cond("contentRating", "is", v);
const B: ("movie" | "show")[] = ["movie", "show"];
const M: ("movie" | "show")[] = ["movie"];
const T: ("movie" | "show")[] = ["show"];

type Case = { label: string; media: ("movie" | "show")[]; filter?: FilterNode };
const CASES: Case[] = [
  { label: "single tag (genre Drama)", media: B, filter: g("Drama") },
  { label: "single int gte (aud>=8)", media: B, filter: cond("audienceRating", "gte", "8") },
  { label: "int RANGE same field (aud 7..8)", media: B, filter: and(cond("audienceRating", "gte", "7"), cond("audienceRating", "lte", "8")) },
  { label: "AND multi-field (Drama & aud>=8)", media: B, filter: and(g("Drama"), cond("audienceRating", "gte", "8")) },
  { label: "OR group (Action OR Comedy)", media: B, filter: or(g("Action"), g("Comedy")) },
  { label: "AND w/ nested OR (Drama & (TV-14|TV-MA))", media: T, filter: and(g("Drama"), or(r("TV-14"), r("TV-MA"))) },
  { label: "deep nest ((Action|Comedy) & (aud>=7 & aud<=9))", media: M, filter: and(or(g("Action"), g("Comedy")), and(cond("audienceRating", "gte", "7"), cond("audienceRating", "lte", "9"))) },
  { label: "negation w/ gate (Drama & !Anime)", media: T, filter: and(g("Drama"), ng("Anime")) },
  { label: "double negation (Drama & !Anime & !Children)", media: T, filter: and(g("Drama"), ng("Anime"), ng("Children")) },
  { label: "SOLE negation present (!Anime)", media: T, filter: ng("Anime") },
  { label: "SOLE negation absent (!ZZZ)", media: T, filter: ng("ZZZ_NOPE") },
  { label: "absent positive (genre ZZZ)", media: B, filter: g("ZZZ_NOPE") },
  { label: "TV-only field SOLE on both (episodeTitle~Test)", media: B, filter: cond("episodeTitle", "contains", "Test") },
  { label: "TV-only field w/ gate on both (Drama & epTitle~the)", media: B, filter: and(g("Drama"), cond("episodeTitle", "contains", "the")) },
  { label: "movie-only field SOLE on both (duration>=120)", media: B, filter: cond("duration", "gte", "120") },
  { label: "movie-only field w/ gate on both (Action & dur>=120)", media: B, filter: and(g("Action"), cond("duration", "gte", "120")) },
  { label: "network (show-only) SOLE on both (HBO)", media: B, filter: cond("network", "is", "HBO") },
  { label: "resolution (episode-scope) 4K", media: B, filter: cond("resolution", "is", "4K") },
  { label: "decade OR x6 (1950..2000)", media: B, filter: or(cond("decade", "is", "1950"), cond("decade", "is", "1960"), cond("decade", "is", "1970"), cond("decade", "is", "1980"), cond("decade", "is", "1990"), cond("decade", "is", "2000")) },
  { label: "recency (addedWithin 30)", media: B, filter: cond("addedWithin", "is", "30") },
  { label: "boolean (unwatched)", media: B, filter: cond("unwatched", "is", "true") },
  { label: "real-world (SCIFI-or & aud>=5 & grownUp)", media: T, filter: and(or(g("Science Fiction"), g("Sci-Fi & Fantasy")), cond("audienceRating", "gte", "5"), and(ng("Anime"), ng("Children"))) },
  { label: "no filter (whole pool)", media: T, filter: undefined },
];

async function main() {
  const s = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null }, enabled: true }, orderBy: { isDefault: "desc" } });
  if (!s?.baseUrl) return console.log("No connected source.");
  const src = { id: s.id, baseUrl: s.baseUrl, token: decryptToken(s.token) };
  const split = (items: { guide: { showRatingKey?: string } }[]) => {
    let mv = 0;
    const shows = new Set<string>();
    for (const i of items) (i.guide.showRatingKey ? shows.add(i.guide.showRatingKey) : mv++);
    return { mv, sh: shows.size };
  };

  let pass = 0;
  for (const c of CASES) {
    const v1 = await resolveFilter(prisma, src, c.media, c.filter, "titleSort", { includeStreams: false, resolver: "v1" });
    const v2 = await resolveFilter(prisma, src, c.media, c.filter, "titleSort", { includeStreams: false, resolver: "v2" });
    const a = new Set(v1.map((i) => i.ratingKey));
    const b = new Set(v2.map((i) => i.ratingKey));
    const diff = [...a].filter((k) => !b.has(k)).length + [...b].filter((k) => !a.has(k)).length;
    const ok = diff === 0;
    if (ok) pass++;
    const s1 = split(v1);
    const s2 = split(v2);
    console.log(
      `${ok ? "✓" : "✗"} ${c.label.padEnd(48)} [${c.media.join("+").padEnd(10)}] ` +
        `v1=${String(v1.length).padStart(5)}(${s1.mv}mv/${s1.sh}sh) v2=${String(v2.length).padStart(5)}(${s2.mv}mv/${s2.sh}sh)` +
        (ok ? "" : `  ✗ DIFF ${diff}`),
    );
  }
  console.log(`\n— ${CASES.length} predicate cases: ${pass} match, ${CASES.length - pass} differ —`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
