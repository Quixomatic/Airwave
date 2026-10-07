/**
 * De-risk the Manual-mode smart-search (prefix + chips) by proving, against the real MediaItem cache,
 * the three load-bearing queries the feature needs — ALL read-only, no writes:
 *   1. Autocomplete source: DISTINCT values of an array facet (genre/actor/director) via
 *      jsonb_array_elements_text, and of a scalar facet (studio/contentRating/resolution) via `->>`.
 *   2. Filtering: Prisma `guide: { path:[...], array_contains }` (array) and `equals` (scalar) actually
 *      match our jsonb guide on Postgres.
 *   3. Numeric: decade from the `year` column, and an `audience:` minimum on `guide.audienceRating`
 *      (tries the Prisma JSON `gte` path first, falls back to a raw cast).
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-media-facets.ts [mediaSourceId]
 */
import prisma from "@airwave/db";

const srcArg = process.argv[2];

const ok = (b: boolean) => (b ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m");

/** DISTINCT elements of a jsonb ARRAY field in the guide, matching `q`, from the cache. */
async function arrayFacet(sourceId: string, key: string, q: string, limit = 15): Promise<string[]> {
  // Guard: only expand rows whose guide.<key> is actually an array (items without the field → skip).
  const rows = await prisma.$queryRaw<{ v: string }[]>`
    SELECT DISTINCT v
    FROM media_item m
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(m.guide -> ${key}) = 'array' THEN m.guide -> ${key} ELSE '[]'::jsonb END
    ) AS v
    WHERE m."mediaSourceId" = ${sourceId}
      AND m.available
      AND v ILIKE ${"%" + q + "%"}
    ORDER BY v
    LIMIT ${limit}`;
  return rows.map((r) => r.v);
}

/** DISTINCT values of a SCALAR guide field (studio / contentRating / resolution). */
async function scalarFacet(sourceId: string, key: string, q: string, limit = 15): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ v: string }[]>`
    SELECT DISTINCT m.guide ->> ${key} AS v
    FROM media_item m
    WHERE m."mediaSourceId" = ${sourceId}
      AND m.available
      AND m.guide ->> ${key} IS NOT NULL
      AND m.guide ->> ${key} ILIKE ${"%" + q + "%"}
    ORDER BY v
    LIMIT ${limit}`;
  return rows.map((r) => r.v);
}

async function main() {
  const source = srcArg
    ? await prisma.mediaSource.findUnique({ where: { id: srcArg }, select: { id: true, name: true } })
    : await prisma.mediaSource.findFirst({ select: { id: true, name: true } });
  if (!source) {
    console.error("No media source found.");
    process.exit(1);
  }
  const sid = source.id;
  const total = await prisma.mediaItem.count({ where: { mediaSourceId: sid, available: true } });
  console.log(`Source: ${source.name} (${sid}) — ${total} available MediaItems\n`);

  // 1. Array-facet autocomplete (genre/actor/director)
  console.log("── Array facets (autocomplete source) ──");
  for (const key of ["genres", "cast", "directors"]) {
    const all = await arrayFacet(sid, key, "");
    console.log(`  ${ok(all.length > 0)} ${key}: ${all.length} distinct (sample) → ${all.slice(0, 8).join(", ")}`);
  }
  // substring filter demo
  const comedyish = await arrayFacet(sid, "genres", "com");
  console.log(`  ${ok(true)} genres matching "com": ${comedyish.join(", ") || "(none)"}`);

  // 2. Scalar-facet autocomplete (studio/contentRating/resolution)
  console.log("\n── Scalar facets (autocomplete source) ──");
  for (const key of ["studio", "contentRating", "resolution"]) {
    const all = await scalarFacet(sid, key, "");
    console.log(`  ${ok(all.length > 0)} ${key}: ${all.length} distinct (sample) → ${all.slice(0, 10).join(", ")}`);
  }

  // 3. Prisma array_contains filter (the actual search path) — pick a real genre and count matches.
  console.log("\n── Prisma filtering (the search where-clause) ──");
  const sampleGenre = (await arrayFacet(sid, "genres", ""))[0];
  if (sampleGenre) {
    const n = await prisma.mediaItem.count({
      where: { mediaSourceId: sid, available: true, guide: { path: ["genres"], array_contains: sampleGenre } },
    });
    console.log(`  ${ok(n > 0)} array_contains genre="${sampleGenre}" → ${n} items`);
  }
  const sampleStudio = (await scalarFacet(sid, "studio", ""))[0];
  if (sampleStudio) {
    const n = await prisma.mediaItem.count({
      where: { mediaSourceId: sid, available: true, guide: { path: ["studio"], equals: sampleStudio } },
    });
    console.log(`  ${ok(n > 0)} path studio="${sampleStudio}" → ${n} items`);
  }

  // 4. decade (year column) + audience minimum (guide.audienceRating)
  console.log("\n── Numeric facets ──");
  const decades = await prisma.$queryRaw<{ d: number }[]>`
    SELECT DISTINCT (year / 10 * 10) AS d FROM media_item
    WHERE "mediaSourceId" = ${sid} AND available AND year IS NOT NULL ORDER BY d`;
  console.log(`  ${ok(decades.length > 0)} decades present → ${decades.map((r) => `${r.d}s`).join(", ")}`);

  // audience:7+ — try the Prisma JSON numeric path first, then a raw cast as fallback.
  let prismaNumericWorks = false;
  let prismaCount = 0;
  try {
    prismaCount = await prisma.mediaItem.count({
      where: { mediaSourceId: sid, available: true, guide: { path: ["audienceRating"], gte: 7 } },
    });
    prismaNumericWorks = true;
  } catch (err) {
    console.log(`  (Prisma JSON gte threw: ${String(err).slice(0, 80)}…)`);
  }
  const rawAud = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*) AS c FROM media_item
    WHERE "mediaSourceId" = ${sid} AND available AND (guide ->> 'audienceRating')::float >= 7`;
  const rawCount = Number(rawAud[0]?.c ?? 0);
  console.log(`  ${ok(prismaNumericWorks)} Prisma JSON gte audienceRating>=7 → ${prismaNumericWorks ? prismaCount + " items" : "NOT SUPPORTED, use raw"}`);
  console.log(`  ${ok(rawCount >= 0)} raw cast audienceRating>=7 → ${rawCount} items`);

  // 5. Per-type coverage of the media-file facets (resolution / hdr / dovi). These come from Media[0]
  //    in toGuideMeta, which shows don't have (a show is not a single file), so they're expected to be
  //    populated on movies + episodes but NULL on show rows — which is why those facets return no shows.
  console.log("\n── Per-type coverage of media-file facets (resolution / hdr / dovi) ──");
  const cov = await prisma.$queryRaw<{ type: string; total: bigint; res: bigint; hdr: bigint; dovi: bigint }[]>`
    SELECT type,
      count(*) AS total,
      count(*) FILTER (WHERE guide ->> 'resolution' IS NOT NULL) AS res,
      count(*) FILTER (WHERE guide ->> 'hdr' IS NOT NULL) AS hdr,
      count(*) FILTER (WHERE guide -> 'dovi' IS NOT NULL AND jsonb_typeof(guide -> 'dovi') <> 'null') AS dovi
    FROM media_item
    WHERE "mediaSourceId" = ${sid} AND available
    GROUP BY type ORDER BY type`;
  for (const r of cov) {
    const n = (b: bigint) => String(Number(b)).padStart(6);
    console.log(`  ${r.type.padEnd(8)} total=${n(r.total)}  resolution=${n(r.res)}  hdr=${n(r.hdr)}  dovi=${n(r.dovi)}`);
  }

  console.log(`\nVerdict: ${total > 0 ? "cache has data; " : "NO data — sync a library first; "}pick the query styles that passed above.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Probe crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
