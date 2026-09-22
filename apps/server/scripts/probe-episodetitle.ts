/** Repro: a TV-only condition (episodeTitle) on a movie+TV channel. Movie lib should contribute 0. */
import prisma from "@airwave/db";

import type { FilterNode } from "@airwave/api/services/plex/filter-fields";
import { resolveFilter } from "@airwave/api/services/plex/resolve";
import { decryptToken } from "@airwave/api/services/plex/token";

const s = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null }, enabled: true }, orderBy: { isDefault: "desc" } });
if (!s?.baseUrl) throw new Error("no source");
const src = { id: s.id, baseUrl: s.baseUrl, token: decryptToken(s.token) };
const filter: FilterNode = { type: "condition", field: "episodeTitle", op: "contains", value: "Test" };

const v1 = await resolveFilter(prisma, src, ["movie", "show"], filter, "titleSort", { includeStreams: false, resolver: "v1" });
const v2 = await resolveFilter(prisma, src, ["movie", "show"], filter, "titleSort", { includeStreams: false, resolver: "v2" });
const movies = (items: { guide: { showRatingKey?: string } }[]) => items.filter((i) => !i.guide.showRatingKey).length;
console.log(`episodeTitle contains "Test" on [movie, show]`);
console.log(`  v1: total=${v1.length}  movies=${movies(v1)}`);
console.log(`  v2: total=${v2.length}  movies=${movies(v2)}`);
console.log(v1.length === v2.length && movies(v2) === 0 ? "  ✓ fixed" : "  ✗ BUG: v2 leaks the whole movie library");
await prisma.$disconnect();
