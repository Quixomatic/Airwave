/**
 * Validate `GET /library/matches` as a REVERSE LOOKUP (external GUID → local library ratingKey) — the live
 * fallback for the channel-import remap (.plans/export-import-schema-versioning.md P3). We don't yet trust
 * that this endpoint returns THIS server's items (the unified Plex spec blends cloud + PMS, and /matches has
 * historically also done agent matching against providers), so this proves it empirically against the real
 * server before the resolver depends on it. Read-only — /library/matches is a GET, nothing is written.
 *
 * Method: take items we already KNOW (ratingKey + tmdb/tvdb/imdb from the synced cache), ask /library/matches
 * for each by guid, and check whether it hands back the SAME local ratingKey (and with what score). Reports
 * per-id-scheme hit rates, whether results look local (numeric ratingKey + /library/metadata key) vs provider
 * (plex:// guid), the score distribution, and a negative control (a bogus guid we don't own).
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-guid-match.ts [mediaSourceId]
 */
import prisma from "@airwave/db";

import type { ExternalIds, GuideMeta } from "../../../packages/api/src/services/plex/client";
import { decryptToken } from "../../../packages/api/src/services/plex/token";

/** A sampled ground-truth row: the id columns + guide (for episode hints). */
type SampleRow = { ratingKey: string; title: string; type: string; guide: GuideMeta } & ExternalIds;

const srcArg = process.argv[2];

const ok = (b: boolean) => (b ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m");
// Our MediaItem.type → Plex metadata type integer (1=movie, 2=show, 3=season, 4=episode).
const PLEX_TYPE: Record<string, number> = { movie: 1, show: 2, season: 3, episode: 4 };

type Match = { score?: number; ratingKey?: string | number; key?: string; guid?: string; type?: string; title?: string };

async function matchByGuid(
  baseUrl: string,
  token: string,
  type: number,
  guid: string,
  extra?: Record<string, string | number | undefined>,
): Promise<{ status: number; matches: Match[] }> {
  const params = new URLSearchParams({ type: String(type), guid });
  if (extra) for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") params.set(k, String(v));
  const res = await fetch(`${baseUrl}/library/matches?${params.toString()}`, {
    headers: { Accept: "application/json", "X-Plex-Token": token },
  });
  if (!res.ok) return { status: res.status, matches: [] };
  const data = (await res.json().catch(() => null)) as { MediaContainer?: { Metadata?: Match[] } } | null;
  return { status: res.status, matches: data?.MediaContainer?.Metadata ?? [] };
}

/** The id schemes to try for an item, as [label, guidValue] built from the stored id columns. */
function schemesFor(g: ExternalIds): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (g.tmdbId) out.push(["tmdb", `tmdb://${g.tmdbId}`]);
  if (g.tvdbId) out.push(["tvdb", `tvdb://${g.tvdbId}`]);
  if (g.imdbId) out.push(["imdb", `imdb://${g.imdbId}`]);
  return out;
}

/** Does a match look like an item in THIS server's library (vs a provider candidate)? */
const looksLocal = (m: Match) =>
  m.ratingKey != null && /^\d+$/.test(String(m.ratingKey)) && (m.key ?? "").startsWith("/library/metadata/");

async function sample(sid: string, type: string, take: number): Promise<SampleRow[]> {
  // Rows that carry at least one external id (columns) AND a ratingKey — our ground truth.
  return prisma.$queryRawUnsafe<SampleRow[]>(
    `SELECT "ratingKey", title, type, guide, "tmdbId", "tvdbId", "imdbId" FROM media_item
     WHERE "mediaSourceId" = $1 AND available AND type = $2
       AND ("tmdbId" IS NOT NULL OR "tvdbId" IS NOT NULL OR "imdbId" IS NOT NULL)
     ORDER BY random() LIMIT $3`,
    sid,
    type,
    take,
  );
}

async function main() {
  const source = srcArg
    ? await prisma.mediaSource.findUnique({ where: { id: srcArg }, select: { id: true, name: true, baseUrl: true, token: true } })
    : await prisma.mediaSource.findFirst({ select: { id: true, name: true, baseUrl: true, token: true } });
  if (!source?.baseUrl) {
    console.error("No connected media source (need a baseUrl to reach Plex).");
    process.exit(1);
  }
  const baseUrl = source.baseUrl;
  const token = decryptToken(source.token);
  console.log(`Source: ${source.name} (${source.id})\n`);

  const movies = await sample(source.id, "movie", 6);
  const shows = await sample(source.id, "show", 4);
  const episodes = await sample(source.id, "episode", 3);
  const items = [...movies, ...shows, ...episodes];
  if (items.length === 0) {
    console.error("No items with external ids in the cache — run a sync first.");
    process.exit(1);
  }

  // Per-scheme tallies: how often the correct local ratingKey came back.
  const tally: Record<string, { tried: number; correct: number; anyLocal: number; scores: number[] }> = {};
  const bump = (s: string) => (tally[s] ??= { tried: 0, correct: 0, anyLocal: 0, scores: [] });

  let firstDump = false;
  for (const row of items) {
    const g = row.guide;
    const ptype = PLEX_TYPE[row.type] ?? 1;
    // Episodes need show-title + season/episode (or air date) hints alongside the guid.
    const extra =
      row.type === "episode"
        ? { grandparentTitle: g.showTitle, parentIndex: g.season, index: g.episode, year: g.year }
        : { title: g.title ?? row.title, year: g.year };

    console.log(`\x1b[1m${row.type}\x1b[0m  rk=${row.ratingKey}  "${g.title ?? row.title}"`);
    for (const [label, guid] of schemesFor(row)) {
      const t = bump(label);
      t.tried++;
      const { status, matches } = await matchByGuid(baseUrl, token, ptype, guid, extra);
      if (status !== 200) {
        console.log(`   ${ok(false)} ${label.padEnd(4)} ${guid}  → HTTP ${status}`);
        continue;
      }
      const hit = matches.find((m) => String(m.ratingKey) === row.ratingKey);
      const localMatches = matches.filter(looksLocal);
      if (hit) t.correct++;
      if (localMatches.length) t.anyLocal++;
      const topScore = matches[0]?.score;
      if (typeof topScore === "number") t.scores.push(topScore);

      // Dump the raw shape of the very first match once, so we SEE local-vs-provider.
      if (!firstDump && matches[0]) {
        firstDump = true;
        console.log(`       (first raw match: ${JSON.stringify(matches[0])})`);
      }

      const got = matches
        .slice(0, 3)
        .map((m) => `rk=${m.ratingKey}${typeof m.score === "number" ? `@${m.score}` : ""}${looksLocal(m) ? "" : "(non-local)"}`)
        .join(", ");
      console.log(
        `   ${ok(!!hit)} ${label.padEnd(4)} ${guid}  → ${matches.length} match(es)${got ? `: ${got}` : ""}` +
          (hit ? "" : localMatches.length ? "  ← returned a LOCAL item but not the expected rk" : "  ← no local match"),
      );
    }
  }

  // Negative control: a guid we (almost certainly) don't own.
  console.log(`\n── Negative control (bogus guid) ──`);
  const neg = await matchByGuid(baseUrl, token, 1, "imdb://tt0000001", { title: "Nonexistent Probe Film", year: 1901 });
  console.log(
    `   bogus imdb://tt0000001 → HTTP ${neg.status}, ${neg.matches.length} match(es)` +
      (neg.matches.length ? ` (top score ${neg.matches[0]?.score}, local=${looksLocal(neg.matches[0])})` : ""),
  );
  const negClean = neg.matches.every((m) => !looksLocal(m) || (m.score ?? 0) < 85);
  console.log(`   ${ok(negClean)} no false LOCAL positive at score ≥ 85`);

  // Summary.
  console.log(`\n── Per-scheme reverse-lookup accuracy ──`);
  for (const [scheme, t] of Object.entries(tally)) {
    const avg = t.scores.length ? Math.round(t.scores.reduce((a, b) => a + b, 0) / t.scores.length) : 0;
    console.log(
      `  ${ok(t.correct === t.tried && t.tried > 0)} ${scheme.padEnd(4)} correct ${t.correct}/${t.tried}` +
        `  (returned a local item ${t.anyLocal}/${t.tried}, avg top score ${avg})`,
    );
  }
  const totalCorrect = Object.values(tally).reduce((a, t) => a + t.correct, 0);
  const totalTried = Object.values(tally).reduce((a, t) => a + t.tried, 0);
  console.log(
    `\nVerdict: ${
      totalCorrect === totalTried && totalTried > 0
        ? "/library/matches is a reliable reverse lookup — use it as the live fallback."
        : totalCorrect > 0
          ? "/library/matches works PARTIALLY — see which schemes/types hit; may need title+year hints or a score gate."
          : "/library/matches did NOT return local ratingKeys here — fall back to title-search + guid-confirm instead."
    }`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Probe crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
