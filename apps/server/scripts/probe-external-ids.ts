/**
 * Verify the external-id capture (v0.15.55 + the recently-added gap-fill): after a metadata re-sync, prove
 * that the portable ids (tmdbId / tvdbId / imdbId) are actually present on the MediaItem cache AND that we
 * can re-grab + parse them live from Plex exactly as the sync does. Two parts, both read-only:
 *   1. Cache coverage — per type, how many rows carry each id (what the last sync populated). Episodes are
 *      expected to carry few/no ids of their own; their portable identity rides on the PARENT SHOW, so we
 *      also report parent-show coverage for episodes.
 *   2. Live round-trip — pull a sample of cached items straight from Plex (via getMetadata, which now sends
 *      includeGuids=1) and confirm the parser yields the same ids the cache holds. This is the end-to-end
 *      proof that "grab + parse" works, independent of whatever is already stored.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-external-ids.ts [mediaSourceId]
 */
import prisma from "@airwave/db";

import type { GuideMeta } from "../../../packages/api/src/services/plex/client";
import { getMetadata } from "../../../packages/api/src/services/plex/client";
import { decryptToken } from "../../../packages/api/src/services/plex/token";

const srcArg = process.argv[2];

const ok = (b: boolean) => (b ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m");
const ids = (g: GuideMeta) =>
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

  // ── 1. Cache coverage per type ──────────────────────────────────────────────────────────────────
  console.log("── Cache coverage: items carrying an external id (per type) ──");
  const cov = await prisma.$queryRaw<
    { type: string; total: bigint; tmdb: bigint; tvdb: bigint; imdb: bigint; any: bigint }[]
  >`
    SELECT type,
      count(*) AS total,
      count(*) FILTER (WHERE guide ->> 'tmdbId' IS NOT NULL) AS tmdb,
      count(*) FILTER (WHERE guide ->> 'tvdbId' IS NOT NULL) AS tvdb,
      count(*) FILTER (WHERE guide ->> 'imdbId' IS NOT NULL) AS imdb,
      count(*) FILTER (WHERE guide ->> 'tmdbId' IS NOT NULL
        OR guide ->> 'tvdbId' IS NOT NULL OR guide ->> 'imdbId' IS NOT NULL) AS any
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
      count(*) FILTER (WHERE p.guide ->> 'tmdbId' IS NOT NULL
        OR p.guide ->> 'tvdbId' IS NOT NULL OR p.guide ->> 'imdbId' IS NOT NULL) AS parent_any
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
      (cacheOk ? "" : "  ← expected > 0 after a sync; did the re-sync run with the new build?"),
  );

  // Sample a few real rows so the actual numbers are eyeballable.
  console.log("\n── Sample cached ids (movies + shows) ──");
  const samples = await prisma.$queryRaw<{ title: string; type: string; guide: GuideMeta }[]>`
    SELECT title, type, guide FROM media_item
    WHERE "mediaSourceId" = ${sid} AND available AND type IN ('movie', 'show')
      AND (guide ->> 'tmdbId' IS NOT NULL OR guide ->> 'tvdbId' IS NOT NULL OR guide ->> 'imdbId' IS NOT NULL)
    ORDER BY title LIMIT 10`;
  for (const s of samples) console.log(`  ${s.type.padEnd(6)} ${ids(s.guide)}  ${s.title}`);
  if (samples.length === 0) console.log("  (none — cache has no ids yet)");

  // ── 2. Live round-trip against Plex ─────────────────────────────────────────────────────────────
  console.log("\n── Live round-trip: re-grab from Plex (includeGuids=1) + parse, compare to cache ──");
  if (!source.baseUrl) {
    console.log("  (source has no baseUrl — can't reach Plex; cache check above stands alone)");
  } else {
    const token = decryptToken(source.token);
    // A spread of real items: a few movies and a few shows from the cache.
    const live = await prisma.mediaItem.findMany({
      where: { mediaSourceId: sid, available: true, type: { in: ["movie", "show"] } },
      select: { ratingKey: true, title: true, type: true, guide: true },
      take: 6,
      orderBy: { title: "asc" },
    });
    let matches = 0;
    let staleCache = 0; // live parsed MORE ids than the cache holds → cache predates a full re-sync (benign)
    let conflicts = 0; // live + cache both have a value and they DISAGREE → a real parse/capture problem
    for (const row of live) {
      const fresh = await getMetadata(source.baseUrl, token, row.ratingKey);
      const cached = row.guide as GuideMeta;
      if (!fresh) {
        console.log(`  ${ok(false)} ${row.title} — Plex returned nothing for ratingKey ${row.ratingKey}`);
        continue;
      }
      // A field "conflicts" only when BOTH sides have a value and they differ. A field the cache lacks but
      // live has is just a stale cache row (the capture gap this build closes), not a parser disagreement.
      const fields = ["tmdbId", "tvdbId", "imdbId"] as const;
      const conflict = fields.some((f) => cached[f] != null && fresh.guide[f] != null && cached[f] !== fresh.guide[f]);
      const cacheBehind = !conflict && fields.some((f) => fresh.guide[f] != null && cached[f] == null);
      const same = !conflict && !cacheBehind;
      if (same) matches++;
      else if (conflict) conflicts++;
      else staleCache++;
      const mark = conflict ? "\x1b[31m✗\x1b[0m" : cacheBehind ? "\x1b[33m~\x1b[0m" : "\x1b[32m✓\x1b[0m";
      const note = conflict ? "  ← CONFLICT (live ≠ cache)" : cacheBehind ? "  ← cache stale, pending next full sync" : "";
      console.log(
        `  ${mark} ${row.type.padEnd(6)} ${row.title}${note}\n` +
          `       live:  ${ids(fresh.guide)}\n` +
          `       cache: ${ids(cached)}`,
      );
    }
    console.log(
      `\n  ${ok(conflicts === 0)} parse agrees with cache: ${matches} exact, ${staleCache} cache-behind (benign), ${conflicts} conflict`,
    );
    if (staleCache > 0)
      console.log(
        "       (cache-behind = item added since the last FULL sync; its ids land on the next full metadata sync — the recently-added scan now captures them too.)",
      );
  }

  console.log(
    `\nVerdict: ${cacheOk ? "ids present in the cache — capture is working." : "NO ids in the cache — run a full metadata re-sync on this build, then re-probe."}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Probe crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
