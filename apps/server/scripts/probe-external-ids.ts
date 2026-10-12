/**
 * Verify the external-id capture after a metadata sync: prove the portable ids (tmdbId / tvdbId / imdbId)
 * are present on the MediaItem rows AND that we can re-grab + parse them live from Plex. As of the P2a
 * migration the ids are first-class INDEXED COLUMNS on MediaItem (not guide JSON), so this reads the columns.
 * Two parts, both read-only:
 *   1. Column coverage — per type, how many rows carry each id (what the last sync populated). Episodes are
 *      expected to carry few/no ids of their own; their portable identity rides on the PARENT SHOW, so we
 *      also report parent-show coverage for episodes.
 *   2. Live round-trip — pull a sample straight from Plex (via getMetadata, which sends includeGuids=1) and
 *      confirm the parser yields the same ids the columns hold. End-to-end proof that "grab + parse" works.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-external-ids.ts [mediaSourceId]
 */
import prisma from "@airwave/db";

import type { ExternalIds } from "../../../packages/api/src/services/plex/client";
import { getMetadata } from "../../../packages/api/src/services/plex/client";
import { decryptToken } from "../../../packages/api/src/services/plex/token";

const srcArg = process.argv[2];

const ok = (b: boolean) => (b ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m");
const ids = (g: ExternalIds) =>
  [g.tmdbId && `tmdb:${g.tmdbId}`, g.tvdbId && `tvdb:${g.tvdbId}`, g.imdbId && `imdb:${g.imdbId}`]
    .filter(Boolean)
    .join(" ") || "(none)";

async function main() {
  const source = srcArg
    ? await prisma.mediaSource.findUnique({
        where: { id: srcArg },
        select: { id: true, name: true, baseUrl: true, token: true },
      })
    : await prisma.mediaSource.findFirst({ select: { id: true, name: true, baseUrl: true, token: true } });
  if (!source) {
    console.error("No media source found.");
    process.exit(1);
  }
  const sid = source.id;
  const total = await prisma.mediaItem.count({ where: { mediaSourceId: sid, available: true } });
  console.log(`Source: ${source.name} (${sid}) — ${total} available MediaItems\n`);

  // ── 1. Column coverage per type ─────────────────────────────────────────────────────────────────
  console.log("── Column coverage: items carrying an external id (per type) ──");
  const cov = await prisma.$queryRaw<
    { type: string; total: bigint; tmdb: bigint; tvdb: bigint; imdb: bigint; any: bigint }[]
  >`
    SELECT type,
      count(*) AS total,
      count(*) FILTER (WHERE "tmdbId" IS NOT NULL) AS tmdb,
      count(*) FILTER (WHERE "tvdbId" IS NOT NULL) AS tvdb,
      count(*) FILTER (WHERE "imdbId" IS NOT NULL) AS imdb,
      count(*) FILTER (WHERE "tmdbId" IS NOT NULL OR "tvdbId" IS NOT NULL OR "imdbId" IS NOT NULL) AS any
    FROM media_item
    WHERE "mediaSourceId" = ${sid} AND available
    GROUP BY type ORDER BY type`;
  const n = (b: bigint) => String(Number(b)).padStart(6);
  const pct = (part: bigint, whole: bigint) =>
    Number(whole) === 0 ? "  -  " : `${Math.round((Number(part) / Number(whole)) * 100)}%`.padStart(4);
  for (const r of cov) {
    console.log(
      `  ${r.type.padEnd(8)} total=${n(r.total)}  tmdb=${n(r.tmdb)}  tvdb=${n(r.tvdb)}  imdb=${n(r.imdb)}  ` +
        `any=${n(r.any)} (${pct(r.any, r.total)})`,
    );
  }

  // Episodes resolve portability through their parent show — report that coverage explicitly.
  const epParent = await prisma.$queryRaw<{ total: bigint; parent_any: bigint }[]>`
    SELECT count(*) AS total,
      count(*) FILTER (WHERE p."tmdbId" IS NOT NULL OR p."tvdbId" IS NOT NULL OR p."imdbId" IS NOT NULL) AS parent_any
    FROM media_item e
    LEFT JOIN media_item p ON p.id = e."parentId"
    WHERE e."mediaSourceId" = ${sid} AND e.available AND e.type = 'episode'`;
  if (epParent[0] && Number(epParent[0].total) > 0) {
    const { total: epTotal, parent_any } = epParent[0];
    console.log(
      `  ${"episode↑show".padEnd(8)} of ${n(epTotal)} episodes, parent show has an id: ${n(parent_any)} (${pct(parent_any, epTotal)})`,
    );
  }

  const movieShowWithId = cov
    .filter((r) => r.type === "movie" || r.type === "show")
    .reduce((acc, r) => acc + Number(r.any), 0);
  const cacheOk = movieShowWithId > 0;
  console.log(
    `\n  ${ok(cacheOk)} movies/shows carrying ids: ${movieShowWithId}` +
      (cacheOk ? "" : "  ← expected > 0 after a sync on this build; did the re-sync run?"),
  );

  // Sample a few real rows so the actual numbers are eyeballable.
  console.log("\n── Sample stored ids (movies + shows) ──");
  const samples = await prisma.mediaItem.findMany({
    where: {
      mediaSourceId: sid,
      available: true,
      type: { in: ["movie", "show"] },
      OR: [{ tmdbId: { not: null } }, { tvdbId: { not: null } }, { imdbId: { not: null } }],
    },
    select: { title: true, type: true, tmdbId: true, tvdbId: true, imdbId: true },
    take: 10,
    orderBy: { title: "asc" },
  });
  for (const s of samples) console.log(`  ${s.type.padEnd(6)} ${ids(s)}  ${s.title}`);
  if (samples.length === 0) console.log("  (none — columns not populated yet; run a sync on this build)");

  // ── 2. Live round-trip against Plex ─────────────────────────────────────────────────────────────
  console.log("\n── Live round-trip: re-grab from Plex (includeGuids=1) + parse, compare to stored columns ──");
  if (!source.baseUrl) {
    console.log("  (source has no baseUrl — can't reach Plex; the column check above stands alone)");
  } else {
    const token = decryptToken(source.token);
    const live = await prisma.mediaItem.findMany({
      where: { mediaSourceId: sid, available: true, type: { in: ["movie", "show"] } },
      select: { ratingKey: true, title: true, type: true, tmdbId: true, tvdbId: true, imdbId: true },
      take: 6,
      orderBy: { title: "asc" },
    });
    let matches = 0;
    let staleCache = 0; // live parsed MORE ids than the columns hold → row predates a sync on this build (benign)
    let conflicts = 0; // both have a value and they DISAGREE → a real parse/capture problem
    for (const row of live) {
      const fresh = await getMetadata(source.baseUrl, token, row.ratingKey);
      if (!fresh) {
        console.log(`  ${ok(false)} ${row.title} — Plex returned nothing for ratingKey ${row.ratingKey}`);
        continue;
      }
      const fields = ["tmdbId", "tvdbId", "imdbId"] as const;
      const conflict = fields.some((f) => row[f] != null && fresh[f] != null && row[f] !== fresh[f]);
      const cacheBehind = !conflict && fields.some((f) => fresh[f] != null && row[f] == null);
      const same = !conflict && !cacheBehind;
      if (same) matches++;
      else if (conflict) conflicts++;
      else staleCache++;
      const mark = conflict ? "\x1b[31m✗\x1b[0m" : cacheBehind ? "\x1b[33m~\x1b[0m" : "\x1b[32m✓\x1b[0m";
      const note = conflict ? "  ← CONFLICT (live ≠ stored)" : cacheBehind ? "  ← row stale, pending next sync" : "";
      console.log(
        `  ${mark} ${row.type.padEnd(6)} ${row.title}${note}\n` +
          `       live:   ${ids(fresh)}\n` +
          `       stored: ${ids(row)}`,
      );
    }
    console.log(
      `\n  ${ok(conflicts === 0)} parse agrees with columns: ${matches} exact, ${staleCache} row-behind (benign), ${conflicts} conflict`,
    );
    if (staleCache > 0)
      console.log("       (row-behind = row written by a sync before this build; re-sync to populate the columns.)");
  }

  console.log(
    `\nVerdict: ${cacheOk ? "ids present in the columns — capture is working." : "NO ids in the columns — run a metadata sync on this build, then re-probe."}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Probe crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
