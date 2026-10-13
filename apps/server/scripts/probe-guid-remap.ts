/**
 * End-to-end check of the import GUID remap resolver (`services/transfer/guid-remap.ts`) against the real
 * MediaItem cache + Plex. Read-only except the resolver's best-effort self-heal (filling id columns it looks
 * up live). Builds GuidRefs from known cached items, runs remapGuids, and asserts each resolves back to its
 * own ratingKey via the cache tier; adds a bogus ref to exercise the live-miss → unmatched path.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-guid-remap.ts [mediaSourceId]
 */
import prisma from "@airwave/db";

import { decryptToken } from "../../../packages/api/src/services/plex/token";
import { type GuidRef, remapGuids } from "../../../packages/api/src/services/transfer/guid-remap";

const srcArg = process.argv[2];
const ok = (b: boolean) => (b ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m");

async function main() {
  const source = srcArg
    ? await prisma.mediaSource.findUnique({ where: { id: srcArg }, select: { id: true, name: true, baseUrl: true, token: true } })
    : await prisma.mediaSource.findFirst({ select: { id: true, name: true, baseUrl: true, token: true } });
  if (!source?.baseUrl) {
    console.error("No connected media source.");
    process.exit(1);
  }
  const src = { id: source.id, baseUrl: source.baseUrl, token: decryptToken(source.token) };
  console.log(`Source: ${source.name}\n`);

  // Ground truth: real cached movies + shows with ids.
  const pick = async (type: string, take: number) =>
    prisma.mediaItem.findMany({
      where: { mediaSourceId: src.id, available: true, type, OR: [{ tmdbId: { not: null } }, { imdbId: { not: null } }] },
      select: { ratingKey: true, title: true, type: true, tmdbId: true, tvdbId: true, imdbId: true, year: true },
      take,
      orderBy: { title: "asc" },
    });
  const items = [...(await pick("movie", 5)), ...(await pick("show", 3))];
  if (items.length === 0) {
    console.error("No cached items with ids — run a sync first.");
    process.exit(1);
  }

  // Build refs keyed by the expected ratingKey, so we can verify the resolver maps each back to itself.
  const refs: GuidRef[] = items.map((it) => ({
    ref: it.ratingKey, // echo = the ratingKey we expect back
    type: it.type as GuidRef["type"],
    tmdbId: it.tmdbId ?? undefined,
    tvdbId: it.tvdbId ?? undefined,
    imdbId: it.imdbId ?? undefined,
    title: it.title,
    year: it.year ?? undefined,
  }));
  // A deliberately-bogus ref: no such tmdb id, nonsense title → cache miss, live miss, unmatched.
  const BOGUS = "__bogus__";
  refs.push({ ref: BOGUS, type: "movie", tmdbId: "999999991", title: "Nonexistent Probe Film ZZZ", year: 1899 });

  const result = await remapGuids(prisma, src, refs);

  console.log("── Per-ref outcome ──");
  const hitByRef = new Map(result.hits.map((h) => [h.ref, h]));
  let correct = 0;
  for (const it of items) {
    const h = hitByRef.get(it.ratingKey);
    const right = h?.ratingKey === it.ratingKey;
    if (right) correct++;
    console.log(`  ${ok(right)} ${it.type.padEnd(6)} "${it.title}" → ${h ? `${h.ratingKey} (${h.via})` : "UNMATCHED"}${right ? "" : `  expected ${it.ratingKey}`}`);
  }
  const bogusUnmatched = result.unmatched.some((u) => u.ref === BOGUS);
  console.log(`  ${ok(bogusUnmatched)} bogus ref correctly unmatched`);

  console.log(
    `\nCounts: total=${result.counts.total} cache=${result.counts.cache} live=${result.counts.live} unmatched=${result.counts.unmatched}`,
  );
  const allGood = correct === items.length && bogusUnmatched;
  console.log(
    `\nVerdict: ${allGood ? "resolver maps every known item to its ratingKey and rejects the bogus one." : "MISMATCH — inspect the rows above."}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Probe crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
