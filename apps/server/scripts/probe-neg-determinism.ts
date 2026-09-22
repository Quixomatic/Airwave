/** Is Plex's `genre!=` non-deterministic? Resolve the SAME sole-negation query repeatedly and diff. */
import prisma from "@airwave/db";

import type { FilterNode } from "@airwave/api/services/plex/filter-fields";
import { resolveFilter } from "@airwave/api/services/plex/resolve";
import { decryptToken } from "@airwave/api/services/plex/token";

const s = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null }, enabled: true }, orderBy: { isDefault: "desc" } });
if (!s?.baseUrl) throw new Error("no source");
const src = { id: s.id, baseUrl: s.baseUrl, token: decryptToken(s.token) };
const filter: FilterNode = { type: "condition", field: "genre", op: "isNot", value: "Anime" };

const run = (resolver: "v1" | "v2") => resolveFilter(prisma, src, ["show"], filter, "titleSort", { includeStreams: false, resolver });
const keys = (items: { ratingKey: string }[]) => new Set(items.map((i) => i.ratingKey));
const diff = (a: Set<string>, b: Set<string>) => [...a].filter((k) => !b.has(k)).length + [...b].filter((k) => !a.has(k)).length;

const v1a = keys(await run("v1"));
const v1b = keys(await run("v1"));
const v2a = keys(await run("v2"));
console.log(`!Anime (show):  v1a=${v1a.size} v1b=${v1b.size} v2a=${v2a.size}`);
console.log(`  v1a vs v1b (SAME resolver, identical query): diff=${diff(v1a, v1b)}  ${diff(v1a, v1b) === 0 ? "deterministic" : "NON-DETERMINISTIC (Plex genre!= is unstable)"}`);
console.log(`  v1a vs v2a: diff=${diff(v1a, v2a)}`);
await prisma.$disconnect();
