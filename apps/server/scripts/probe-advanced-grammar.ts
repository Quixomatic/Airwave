/**
 * Empirically probe Plex's advanced-filter grammar to resolve what the docs leave ambiguous, BEFORE we trust
 * the v2 translator. Fires synthetic queries with `X-Plex-Container-Size=0` (returns `totalSize` without
 * fetching rows) against the movie library and prints exact counts, so we can settle:
 *   - Is `genre=A&genre=B` (same field, two params) an AND or an OR?
 *   - Does comma-OR (`genre=A,B`) equal explicit `or=1`?
 *   - Does implicit AND work after a `pop=1` (group then bare condition)?
 *   - Does `advancedFilters=1` matter, or do push/or/pop work without it?
 *   - Do two push/pop groups AND together?
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-advanced-grammar.ts
 */
import prisma from "@airwave/db";

import { getFilterValues, getLibraries } from "@airwave/api/services/plex/client";
import { decryptToken } from "@airwave/api/services/plex/token";

async function main() {
  const source = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null }, enabled: true }, orderBy: { isDefault: "desc" } });
  if (!source?.baseUrl) return console.log("No connected source.");
  const base = source.baseUrl;
  const token = decryptToken(source.token);
  const libs = await getLibraries(base, token);
  const movie = libs.find((l) => l.type === "movie");
  if (!movie) return console.log("No movie library.");

  const genres = await getFilterValues(base, token, movie.key, "genre");
  const byTitle = new Map(genres.map((g) => [g.title, g.id]));
  const A = byTitle.get("Action");
  const C = byTitle.get("Comedy");
  if (!A || !C) return console.log("Need Action + Comedy genres.");
  const decade = "1990"; // an int field to AND with

  // count(params) → exact totalSize with no rows fetched.
  const count = async (label: string, params: string): Promise<number> => {
    const url = `${base}/library/sections/${movie.key}/all?type=1&X-Plex-Container-Size=0${params ? `&${params}` : ""}`;
    const res = await fetch(url, { headers: { Accept: "application/json", "X-Plex-Token": token } });
    if (!res.ok) {
      console.log(`${label.padEnd(52)} HTTP ${res.status}`);
      return -1;
    }
    const j = (await res.json()) as { MediaContainer?: { totalSize?: number; size?: number } };
    const n = j.MediaContainer?.totalSize ?? j.MediaContainer?.size ?? -1;
    console.log(`${label.padEnd(52)} ${String(n).padStart(6)}   ${params}`);
    return n;
  };

  console.log(`Library ${movie.title} (key ${movie.key}) — Action=${A} Comedy=${C}\n`);

  console.log("=== singles ===");
  const cA = await count("genre=Action", `genre=${A}`);
  const cC = await count("genre=Comedy", `genre=${C}`);

  console.log("\n=== same-field two params: AND or OR? ===");
  const cTwoParams = await count("genre=A&genre=C (two params)", `genre=${A}&genre=${C}`);
  console.log(`  (if ~intersection → AND; if > max(cA,cC) → OR)`);

  console.log("\n=== OR forms (should match each other, and be >= max single) ===");
  const cComma = await count("genre=A,C (comma OR)", `genre=${A},${C}`);
  const cOr = await count("genre=A or=1 genre=C", `genre=${A}&or=1&genre=${C}`);
  const cOrAdv = await count("advancedFilters=1 genre=A or=1 genre=C", `advancedFilters=1&genre=${A}&or=1&genre=${C}`);
  const cOrPush = await count("push genre=A or=1 genre=C pop (adv)", `advancedFilters=1&push=1&genre=${A}&or=1&genre=${C}&pop=1`);

  console.log("\n=== (A OR C) AND decade — implicit AND after pop ===");
  await count("push A or C pop & decade (implicit AND)", `advancedFilters=1&push=1&genre=${A}&or=1&genre=${C}&pop=1&decade=${decade}`);
  await count("decade & push A or C pop (group last)", `advancedFilters=1&decade=${decade}&push=1&genre=${A}&or=1&genre=${C}&pop=1`);
  await count("push A or C pop & and=1 & decade (explicit and)", `advancedFilters=1&push=1&genre=${A}&or=1&genre=${C}&pop=1&and=1&decade=${decade}`);
  const cAdecade = await count("genre=A & decade (baseline AND)", `genre=${A}&decade=${decade}`);
  console.log(`  (the three grouped forms should each equal |(A∪C) ∩ decade|; ${cAdecade} is just A∩decade for reference)`);

  console.log("\n=== two groups ANDed: (A) AND (C) via push/pop ===");
  await count("push A pop push C pop (implicit AND of groups)", `advancedFilters=1&push=1&genre=${A}&pop=1&push=1&genre=${C}&pop=1`);
  console.log(`  (should equal the same-field AND result ${cTwoParams} if that was AND, i.e. intersection)`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
