/**
 * Probe the connected library to verify the preset-filter quality changes against REAL data before we bake
 * them into presets.ts. Dumps the actual tag vocabularies (genre / network / contentRating per library type),
 * proves/​disproves the `isNot`-with-missing-tag null-drop, and prints exact preview counts for candidate
 * filters (old vs new) so we commit numbers, not guesses.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-preset-filters.ts
 */
import prisma from "@airwave/db";

import { getFilterValues, getLibraries } from "@airwave/api/services/plex/client";
import type { FilterCondition, FilterGroupNode, FilterNode, FilterOp } from "@airwave/api/services/plex/filter-fields";
import { previewFilter } from "@airwave/api/services/agent/tools";
import { decryptToken } from "@airwave/api/services/plex/token";

// --- filter builders (mirror presets.ts) -----------------------------------
const cond = (field: string, op: FilterOp, value: string): FilterCondition => ({ type: "condition", field, op, value });
const and = (...children: FilterNode[]): FilterGroupNode => ({ type: "group", combinator: "and", children });
const or = (...children: FilterNode[]): FilterGroupNode => ({ type: "group", combinator: "or", children });
const genre = (g: string) => cond("genre", "is", g);
const notGenre = (g: string) => cond("genre", "isNot", g);
const network = (n: string) => cond("network", "is", n);
const studio = (s: string) => cond("studio", "is", s);
const rating = (v: string) => cond("contentRating", "is", v);
const aud = (v: string) => cond("audienceRating", "gte", v);
const crit = (v: string) => cond("criticRating", "gte", v);
const durLte = (v: string) => cond("duration", "lte", v);
const actor = (n: string) => cond("actor", "is", n);

type MT = ("movie" | "show")[];
const both: MT = ["movie", "show"];
const movie: MT = ["movie"];
const tv: MT = ["show"];

async function main() {
  const source = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null }, enabled: true }, orderBy: { isDefault: "desc" } });
  if (!source?.baseUrl) return console.log("No connected source.");
  const sid = source.id;
  const base = source.baseUrl;
  const token = decryptToken(source.token);
  const libs = await getLibraries(base, token);
  const movieLib = libs.find((l) => l.type === "movie");
  const showLib = libs.find((l) => l.type === "show");
  console.log(`Source: ${source.name} — movie lib ${movieLib?.key ?? "-"}, show lib ${showLib?.key ?? "-"}\n`);

  const dump = async (label: string, key: string | undefined, field: string) => {
    if (!key) return;
    const vals = (await getFilterValues(base, token, key, field)).map((v) => v.title);
    console.log(`${label} ${field} (${vals.length}):\n  ${vals.join(" | ")}\n`);
  };

  console.log("========== TAG VOCABULARIES ==========\n");
  await dump("MOVIE", movieLib?.key, "genre");
  await dump("SHOW ", showLib?.key, "genre");
  await dump("SHOW ", showLib?.key, "network");
  await dump("MOVIE", movieLib?.key, "contentRating");
  await dump("SHOW ", showLib?.key, "contentRating");
  await dump("MOVIE", movieLib?.key, "studio");

  const pv = async (label: string, mediaTypes: MT, filter?: FilterNode) => {
    try {
      const r = await previewFilter(prisma, { mediaSourceId: sid, mediaTypes, filter, detail: "tiles", includeStreams: false });
      console.log(`${label.padEnd(52)} total=${String(r.totalItems).padStart(5)}  shows=${String(r.showCount).padStart(4)}  movies=${String(r.movieCount).padStart(5)}`);
    } catch (e) {
      console.log(`${label.padEnd(52)} ERROR ${e instanceof Error ? e.message : e}`);
    }
  };

  console.log("========== isNot NULL-DROP BUG ==========");
  console.log("(If notGenre(nonexistent) drops the whole channel to ~0, the bug is present.)");
  await pv("tv Drama", tv, genre("Drama"));
  await pv("tv Drama AND notGenre('ZZZ_NONEXISTENT')", tv, and(genre("Drama"), notGenre("ZZZ_NONEXISTENT")));
  await pv("tv Drama AND notGenre('Anime')", tv, and(genre("Drama"), notGenre("Anime")));
  await pv("tv Drama AND notGenre('Anime') AND notGenre('Children')", tv, and(genre("Drama"), notGenre("Anime"), notGenre("Children")));

  console.log("\n========== crit IS NULL ON TV ==========");
  await pv("tv Drama aud>=8", tv, and(genre("Drama"), aud("8")));
  await pv("tv Drama aud>=8 crit>=7  (old prestige-tv)", tv, and(genre("Drama"), aud("8"), crit("7")));

  console.log("\n========== duration DROPS TV ==========");
  await pv("both durLte(45)  (old quick-bites)", both, durLte("45"));
  await pv("movie durLte(45)  (new quick-bites)", movie, durLte("45"));

  console.log("\n========== NETWORK vs STUDIO for TV brands ==========");
  await pv("both studio('HBO')  (old hbo)", both, studio("HBO"));
  await pv("show network('HBO')", tv, network("HBO"));
  await pv("show network('HBO') or network('Max')", tv, or(network("HBO"), network("Max"), network("HBO Max")));

  console.log("\n========== TV GENRE NAME CHECKS ==========");
  await pv("tv genre('Science Fiction')", tv, genre("Science Fiction"));
  await pv("tv genre('Sci-Fi & Fantasy')", tv, genre("Sci-Fi & Fantasy"));
  await pv("tv genre('Action')", tv, genre("Action"));
  await pv("tv genre('Action/Adventure')", tv, genre("Action & Adventure"));
  await pv("tv genre('War')", tv, genre("War"));
  await pv("tv genre('War & Politics')", tv, genre("War & Politics"));

  console.log("\n========== ACTOR: movie vs show level ==========");
  await pv("both actor('Bryan Cranston')", both, actor("Bryan Cranston"));
  await pv("movie actor('Tom Hanks')", movie, actor("Tom Hanks"));
  await pv("tv actor('Bryan Cranston')", tv, actor("Bryan Cranston"));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
