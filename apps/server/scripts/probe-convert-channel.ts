/**
 * Diagnose "Convert to Manual" for a specific channel's filter: resolve it, group matched episodes by
 * show, and print matched-vs-cached-total per show so we can see why whole shows aren't collapsing to the
 * show key. Read-only.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-convert-channel.ts [channelNumber=3]
 */
import prisma from "@airwave/db";
import { resolveFilter } from "../../../packages/api/src/services/plex/resolve";
import { channelSortParam } from "../../../packages/api/src/services/plex/sort-fields";
import { decryptToken } from "../../../packages/api/src/services/plex/token";

const num = process.argv[2] ?? "3";

const channel = await prisma.channel.findFirst({
  where: { number: Number(num) },
  include: { definitions: true },
});
if (!channel) {
  console.error(`No channel with number ${num}`);
  process.exit(1);
}
console.log(`Channel #${channel.number} "${channel.name}" (${channel.id}) — mediaSource ${channel.mediaSourceId}`);

const def = channel.definitions.find((d) => d.kind === "PREDICATE");
if (!def) {
  console.error(`Channel has no PREDICATE definition (kinds: ${channel.definitions.map((d) => d.kind).join(", ")})`);
  process.exit(1);
}
const pf = (def.plexFilter as { mediaTypes?: string[]; filter?: unknown } | null) ?? {};
const mediaTypes = pf.mediaTypes ?? ["movie", "show"];
console.log(`mediaTypes=${JSON.stringify(mediaTypes)}`);
console.log(`filter=${JSON.stringify(pf.filter)}\n`);

const source = await prisma.mediaSource.findUniqueOrThrow({ where: { id: channel.mediaSourceId } });
const rsource = { id: source.id, baseUrl: source.baseUrl!, token: decryptToken(source.token) };
const sort = channelSortParam("SHUFFLE", "title", "asc");

const items = await resolveFilter(prisma, rsource, mediaTypes, pf.filter as never, sort, { includeStreams: false });
console.log(`resolveFilter returned ${items.length} leaf items`);

// Look at the actual guide shape of the first few episodes.
const sampleEp = items.find((i) => i.guide?.showRatingKey) ?? items[0];
console.log(`sample item guide keys: ${sampleEp ? Object.keys(sampleEp.guide ?? {}).join(", ") : "(none)"}`);
console.log(`sample showRatingKey=${JSON.stringify(sampleEp?.guide?.showRatingKey)} type=${JSON.stringify(sampleEp?.guide?.type)}\n`);

const atomic: string[] = [];
const byShow = new Map<string, string[]>();
for (const it of items) {
  const s = it.guide?.showRatingKey;
  if (s) (byShow.get(s) ?? byShow.set(s, []).get(s)!).push(it.ratingKey);
  else atomic.push(it.ratingKey);
}
console.log(`atomic (movies / no showRatingKey) = ${atomic.length}`);
console.log(`distinct matched shows = ${byShow.size}\n`);

const showKeys = [...byShow.keys()];
const totals = new Map<string, number>();
if (showKeys.length) {
  const rows = await prisma.$queryRaw<{ show: string | null; total: bigint }[]>`
    SELECT guide ->> 'showRatingKey' AS show, count(*) AS total
    FROM media_item
    WHERE "mediaSourceId" = ${channel.mediaSourceId} AND available AND type = 'episode'
      AND guide ->> 'showRatingKey' IN (${(await import("@airwave/db")).Prisma.join(showKeys)})
    GROUP BY 1`;
  for (const r of rows) if (r.show) totals.set(r.show, Number(r.total));
}
console.log(`cache returned totals for ${totals.size} of ${showKeys.length} matched shows\n`);

let whole = 0;
let partial = 0;
for (const [showKey, eps] of byShow) {
  const total = totals.get(showKey) ?? 0;
  const isWhole = total > 0 && eps.length >= total;
  if (isWhole) whole++;
  else partial++;
  if (partial + whole <= 15) {
    console.log(`  show ${showKey}: matched=${eps.length} cachedTotal=${total} → ${isWhole ? "WHOLE (show key)" : "partial (episodes)"}`);
  }
}
console.log(`\nSummary: ${whole} whole shows, ${partial} partial shows`);
await prisma.$disconnect();
