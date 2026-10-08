/**
 * Inspect the "keep multi-part episodes together" feature (issue #37): run the REAL scheduler detection
 * (`groupMultiPartRuns` + `partNumber` from services/schedule/timeline.ts) over the MediaItem cache and
 * report the runs it would keep together — per show, in season/episode order. Also lists "near-misses"
 * (titles that look multi-part but match no pattern) so we can spot conventions worth adding. Read-only.
 *
 *   cd apps/server && bun --env-file=.env run scripts/probe-multipart-episodes.ts [mediaSourceId]
 */
import prisma from "@airwave/db";

import type { PlexItem } from "../../../packages/api/src/services/plex/client";
import { MAX_RUN_PARTS, groupMultiPartRuns, partNumber } from "../../../packages/api/src/services/schedule/timeline";

const srcArg = process.argv[2];

/** A title that LOOKS multi-part but matched no pattern — surfaces conventions the detection doesn't cover. */
const NEAR_MISS = /\bpart\b|\bpt\.?\b|\(\s*\d+\s*\)|\d+\s*of\s*\d+|\(\s*\d+\s*\/\s*\d+\s*\)|\bchapter\b|\bconclusion\b/i;

async function main() {
  const source = srcArg
    ? await prisma.mediaSource.findUnique({ where: { id: srcArg }, select: { id: true, name: true } })
    : await prisma.mediaSource.findFirst({ select: { id: true, name: true } });
  if (!source) {
    console.error("No media source found.");
    process.exit(1);
  }

  const rows = await prisma.mediaItem.findMany({
    where: { mediaSourceId: source.id, type: "episode", available: true },
    select: { ratingKey: true, title: true, durationMs: true, guide: true },
  });
  console.log(`Source: ${source.name} — ${rows.length} available episodes\n`);

  // Feed the REAL detector PlexItem-shaped rows; track show titles + near-misses for the report.
  const items: PlexItem[] = [];
  const showTitleOf = new Map<string, string>();
  const nearMisses = new Set<string>();
  let titled = 0;
  for (const r of rows) {
    const g = (r.guide as Record<string, unknown> | null) ?? {};
    const title = (typeof g.title === "string" ? g.title : r.title) ?? "";
    if (partNumber(title) != null) titled++;
    else if (NEAR_MISS.test(title)) nearMisses.add(title);
    items.push({ ratingKey: r.ratingKey, title, durationMs: r.durationMs, guide: g } as unknown as PlexItem);
    const show = typeof g.showRatingKey === "string" ? g.showRatingKey : null;
    if (show && typeof g.showTitle === "string") showTitleOf.set(show, g.showTitle);
  }
  console.log(`Episodes whose title encodes a part number: ${titled}\n`);

  // Each entry in the continuations map is a kept-together run: its lead key + the following parts.
  const { continuations } = groupMultiPartRuns(items);
  const byKey = new Map(items.map((i) => [i.ratingKey, i]));
  const runs = [...continuations.entries()]
    .map(([leadKey, parts]) => {
      const lead = byKey.get(leadKey)!;
      const show = (lead.guide.showRatingKey && showTitleOf.get(lead.guide.showRatingKey)) || "(unknown show)";
      return { showTitle: show, parts: [lead, ...parts] };
    })
    .sort((a, b) => b.parts.length - a.parts.length || a.showTitle.localeCompare(b.showTitle));

  console.log(`── Multi-part runs kept together (start at part 1, length 2–${MAX_RUN_PARTS}): ${runs.length} ──`);
  const byLen = new Map<number, number>();
  for (const r of runs) byLen.set(r.parts.length, (byLen.get(r.parts.length) ?? 0) + 1);
  console.log(`   by length: ${[...byLen.entries()].sort((a, b) => a[0] - b[0]).map(([l, c]) => `${l}-part×${c}`).join(", ") || "(none)"}\n`);
  for (const run of runs.slice(0, 40)) {
    const se = (e: PlexItem) => `S${e.guide.season ?? "?"}E${e.guide.episode ?? "?"}`;
    console.log(`  ${run.showTitle} — ${run.parts.length} parts`);
    for (const ep of run.parts) console.log(`     [part ${partNumber(ep.guide.title)}] ${se(ep)}  "${ep.guide.title ?? ep.title}"`);
  }
  if (runs.length > 40) console.log(`  … and ${runs.length - 40} more`);

  const nm = [...nearMisses].sort();
  console.log(`\n── Near-misses (look multi-part, matched NO pattern): ${nm.length} distinct ──`);
  for (const t of nm.slice(0, 30)) console.log(`     "${t}"`);
  if (nm.length > 30) console.log(`  … and ${nm.length - 30} more`);

  console.log(
    `\nVerdict: ${runs.length > 0 ? `keeps ${runs.length} run(s) together — spot-check the titles above` : "no runs detected"}.`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Probe crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
