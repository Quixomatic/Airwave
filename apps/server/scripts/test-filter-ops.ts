/**
 * Empirically test Plex string-filter operators against the connected source, so we know what the query
 * builder's `==` (exact), `<=` (begins), `>=` (ends) and the negations ACTUALLY return vs `=` (contains) —
 * not what the OpenAPI claims. Prints result counts + sample titles for each form, and probes a couple of
 * alternate encodings for exact-match in case Plex doesn't honor a bare `title==value`.
 *
 *   cd apps/server && bun --env-file=.env run scripts/test-filter-ops.ts
 */
import prisma from "@airwave/db";

import { getLibraries } from "@airwave/api/services/plex/client";
import { buildParam } from "@airwave/api/services/plex/filter-fields";
import { decryptToken } from "@airwave/api/services/plex/token";

const H = (token: string) => ({ Accept: "application/json", "X-Plex-Token": token });
const noTag = async () => undefined;

async function qType(base: string, token: string, key: string, type: 1 | 2 | 4, param: string): Promise<string[]> {
  const url = `${base}/library/sections/${key}/all?type=${type}${param ? `&${param}` : ""}&sort=titleSort&X-Plex-Container-Size=60`;
  const res = await fetch(url, { headers: H(token) });
  if (!res.ok) return [`<HTTP ${res.status}>`];
  const j: any = await res.json();
  // Coalesce episode rows to their show title so a show's exact-match result reads cleanly.
  return (j?.MediaContainer?.Metadata ?? []).map((m: any) => (m.grandparentTitle ?? m.title) as string);
}
const q = (base: string, token: string, key: string, param: string) => qType(base, token, key, 1, param);

const show = (label: string, titles: string[]) =>
  console.log(`${label.padEnd(34)} -> ${String(titles.length).padStart(4)}  ${titles.slice(0, 6).join(" | ")}${titles.length > 6 ? " …" : ""}`);

async function main() {
  const source = await prisma.mediaSource.findFirst({ where: { baseUrl: { not: null } }, orderBy: { isDefault: "desc" } });
  if (!source?.baseUrl) return console.log("No connected source.");
  const base = source.baseUrl;
  const token = decryptToken(source.token);
  const libs = await getLibraries(base, token);
  const lib = libs.find((l: any) => l.type === "movie");
  if (!lib) return console.log("No movie library.");
  console.log(`Library: ${lib.title} (key ${lib.key})\n`);

  // A title that is a PREFIX of several others is the ideal exact-vs-contains probe: `contains "3 Ninjas"`
  // returns the sequels too, `equals "3 Ninjas"` must return ONLY the base film. Prefer that if present.
  const all = await q(base, token, lib.key, "");
  const T =
    all.find((t) => all.filter((o) => o.startsWith(t)).length > 1 && t.length > 4) ??
    all.find((t) => t && t.length > 3) ??
    "Star";
  const S = (T.split(/\s+/)[0] ?? T); // a full first word, likely a substring of several titles
  const encT = encodeURIComponent(T);
  const encS = encodeURIComponent(S);
  console.log(`Exact-title probe  T = "${T}"`);
  console.log(`Substring probe    S = "${S}"\n`);

  console.log("--- exact-title T: contains should include it; a working 'equals' should also return it ---");
  show("contains    title=T", await q(base, token, lib.key, `title=${encT}`));
  show("equals raw  title==T", await q(base, token, lib.key, `title==${encT}`));
  show("equals A    title%3D=T", await q(base, token, lib.key, `title%3D=${encT}`)); // encode the OP =, keep separator
  show("equals B    title=%3D%3DT", await q(base, token, lib.key, `title=%3D%3D${encT}`));
  show("equals C    title%3D%3DT", await q(base, token, lib.key, `title%3D%3D${encT}`));

  console.log("\n--- substring S: contains = many; a working 'equals' = only titles that ARE exactly S (few/0) ---");
  show("contains   title=S", await q(base, token, lib.key, `title=${encS}`));
  show("equals     title==S", await q(base, token, lib.key, `title==${encS}`));
  show("beginsWith title<=S", await q(base, token, lib.key, `title<=${encS}`));
  show("endsWith   title>=S", await q(base, token, lib.key, `title>=${encS}`));
  show("notContains title!=S", await q(base, token, lib.key, `title!=${encS}`));
  show("notEquals  title!==S", await q(base, token, lib.key, `title!==${encS}`));

  console.log("\n--- notEquals on the EXACT title T (should exclude exactly the 1 base film; raw !== likely wrong) ---");
  const total = (await q(base, token, lib.key, "")).length; // page-capped, but relative counts still tell the story
  console.log(`(page shows ${total}; using it as a rough baseline)`);
  show("notEquals raw title!==T", await q(base, token, lib.key, `title!==${encT}`));
  show("notEquals A  title!%3D=T", await q(base, token, lib.key, `title!%3D=${encT}`));

  // === REAL APP PATH: run the exact query buildParam() actually generates (post-fix) ===
  console.log("\n=== buildParam() output — the real app query — run against Plex ===");
  const movieEq = await buildParam({ type: "condition", field: "title", op: "equals", value: T }, noTag, { libType: "movie" });
  console.log(`movie  equals "${T}"  -> param: ${movieEq}`);
  show("  result", await q(base, token, lib.key, movieEq ?? ""));

  const showLib = libs.find((l: any) => l.type === "show");
  if (showLib) {
    const p = await buildParam({ type: "condition", field: "title", op: "equals", value: "Bluey" }, noTag, { libType: "show" });
    console.log(`\nshow   equals "Bluey" (lib "${showLib.title}")  -> param: ${p}`);
    // Raw show titles (type=2 → no grandparentTitle coalesce, so this is the exact `title` field Plex filters on)
    const rawShows = await qType(base, token, showLib.key, 2, `title=Bluey`);
    console.log(`  RAW show.title values matching contains "Bluey": ${rawShows.map((t) => JSON.stringify(t)).join(" | ") || "(none)"}`);
    const containsR = [...new Set(await qType(base, token, showLib.key, 4, `show.title=Bluey`))];
    const equalsR = [...new Set(await qType(base, token, showLib.key, 4, p ?? ""))];
    console.log(`  episodes contains "Bluey" -> shows: ${containsR.join(" | ") || "(none)"}`);
    console.log(`  episodes equals   "Bluey" -> shows: ${equalsR.join(" | ") || "(none)"}`);
    // And exact against the raw title (if it carries a year), to prove exact works when the value is right:
    if (rawShows[0]) {
      const pExact = await buildParam({ type: "condition", field: "title", op: "equals", value: rawShows[0] }, noTag, { libType: "show" });
      const exactR = [...new Set(await qType(base, token, showLib.key, 4, pExact ?? ""))];
      console.log(`  episodes equals ${JSON.stringify(rawShows[0])} (${pExact}) -> shows: ${exactR.join(" | ") || "(none)"}`);
    }
  } else {
    console.log("\n(no show library found — skipping Bluey test)");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
