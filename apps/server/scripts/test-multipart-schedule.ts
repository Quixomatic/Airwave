/**
 * END-TO-END test of "keep multi-part episodes together" (issue #37) against a real generated schedule.
 *
 * Reconfigures a TEST channel (by number, default 3) into a MANUAL pool built from shows that actually have
 * multi-part runs in the cache, turns the toggle ON, generates the full schedule through the real pipeline,
 * then checks every detected run comes out CONTIGUOUS and IN ORDER among the PROGRAM slots. Runs it three
 * ways: plain SHUFFLE, SHUFFLE + a group-by-show round-robin strategy (proving keep-together SUPERSEDES the
 * strategy), and a control with the toggle OFF (to show it actually makes a difference).
 *
 * DESTRUCTIVE to the given channel: it replaces the channel's definition + schedule. Use a throwaway test
 * channel (3 by default), exactly like test-schedule-lock.ts.
 *
 *   cd apps/server && bun --env-file=.env run scripts/test-multipart-schedule.ts [channelNumber=3]
 */
import prisma, { Prisma } from "@airwave/db";

import type { PlexItem } from "../../../packages/api/src/services/plex/client";
import { generateChannelSchedule } from "../../../packages/api/src/services/schedule/generate";
import { type ChannelStrategy, groupMultiPartRuns } from "../../../packages/api/src/services/schedule/timeline";

const num = Number(process.argv[2] ?? "3");
const MAX_SHOWS = 8; // keep the pool (and the generated schedule) bounded

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

/** Build PlexItem-shaped rows (what the detector/scheduler read) from cached episodes. */
function toItems(rows: { ratingKey: string; title: string; durationMs: number; guide: unknown }[]): PlexItem[] {
  return rows.map(
    (r) => ({ ratingKey: r.ratingKey, title: r.title, durationMs: r.durationMs, guide: (r.guide ?? {}) as PlexItem["guide"] }),
  );
}

async function run(channelId: string, label: string, ordering: "SHUFFLE", strategy: ChannelStrategy | null, keep: boolean) {
  await prisma.channel.update({
    where: { id: channelId },
    data: {
      ordering,
      keepMultiPartTogether: keep,
      strategy: strategy ? (JSON.parse(JSON.stringify(strategy)) as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
  // minDurationSeconds: 1 → exactly one full pass, so every pool item appears once (unambiguous positions).
  await generateChannelSchedule(prisma, channelId, { minDurationSeconds: 1, from: new Date("2026-01-01T00:00:00Z") });

  const slots = await prisma.scheduleItem.findMany({
    where: { channelId, kind: "PROGRAM" },
    orderBy: { startsAt: "asc" },
    select: { ratingKey: true },
  });
  const seq = slots.map((s) => s.ratingKey!);
  const pos = new Map<string, number>();
  seq.forEach((k, i) => pos.set(k, i));
  return { label, keep, seq, pos };
}

async function main() {
  const channel = await prisma.channel.findFirst({ where: { number: num } });
  if (!channel) {
    console.error(`No channel #${num}`);
    process.exit(1);
  }
  console.log(`Using channel #${num} "${channel.name}" (${channel.id}) — THIS REWRITES ITS DEFINITION + SCHEDULE\n`);

  // 1. Find shows that have multi-part runs, pick a varied handful (longest runs first), pool ALL their episodes.
  const allRows = await prisma.mediaItem.findMany({
    where: { mediaSourceId: channel.mediaSourceId, type: "episode", available: true },
    select: { ratingKey: true, title: true, durationMs: true, guide: true },
  });
  const { continuations: allRuns } = groupMultiPartRuns(toItems(allRows));
  const byKey = new Map(toItems(allRows).map((i) => [i.ratingKey, i]));
  // Order shows by their longest run so we get the 5/4/3-parters, then take MAX_SHOWS distinct.
  const showOfLead = (leadKey: string) => byKey.get(leadKey)!.guide.showRatingKey!;
  const runLen = [...allRuns.entries()].map(([leadKey, parts]) => ({ show: showOfLead(leadKey), len: parts.length + 1 }));
  runLen.sort((a, b) => b.len - a.len);
  const shows: string[] = [];
  for (const r of runLen) if (!shows.includes(r.show) && shows.length < MAX_SHOWS) shows.push(r.show);

  const poolRows = allRows.filter((r) => {
    const s = (r.guide as { showRatingKey?: string } | null)?.showRatingKey;
    return s != null && shows.includes(s);
  });
  const poolKeys = poolRows.map((r) => r.ratingKey);
  const showTitle = (sk: string) =>
    (poolRows.find((r) => (r.guide as { showRatingKey?: string }).showRatingKey === sk)?.guide as { showTitle?: string })
      ?.showTitle ?? sk;
  console.log(`Pool: ${poolKeys.length} episodes from ${shows.length} shows: ${shows.map(showTitle).join(", ")}`);

  // 2. Expected runs WITHIN the pool.
  const { continuations: expected } = groupMultiPartRuns(toItems(poolRows));
  const runSeqs = [...expected.entries()].map(([leadKey, parts]) => [leadKey, ...parts.map((p) => p.ratingKey)]);
  console.log(`Expected multi-part runs in this pool: ${runSeqs.length}\n`);

  // 3. Reconfigure the channel to a MANUAL pool, then run the three variants.
  await prisma.channelDefinition.deleteMany({ where: { channelId: channel.id } });
  await prisma.channelDefinition.create({
    data: { channelId: channel.id, kind: "MANUAL_ITEMS", manualItemKeys: poolKeys },
  });

  const groupByShow: ChannelStrategy = { rotation: "round_robin", rotationOrder: "shuffle", grouping: [{ scope: "show", run: 1 }] };
  const variants = [
    await run(channel.id, "SHUFFLE, no strategy, keep ON", "SHUFFLE", null, true),
    await run(channel.id, "SHUFFLE + group-by-show round-robin, keep ON", "SHUFFLE", groupByShow, true),
    await run(channel.id, "SHUFFLE, no strategy, keep OFF (control)", "SHUFFLE", null, false),
  ];

  // 4. Verify contiguity per variant.
  const check = (v: { label: string; keep: boolean; seq: string[]; pos: Map<string, number> }) => {
    let ok = 0;
    const fails: string[] = [];
    for (const seq of runSeqs) {
      const start = v.pos.get(seq[0]!);
      if (start == null) {
        fails.push(`${showTitle(byKey.get(seq[0]!)!.guide.showRatingKey!)}: lead not scheduled`);
        continue;
      }
      const contiguous = seq.every((k, i) => v.seq[start + i] === k);
      if (contiguous) ok++;
      else {
        const lead = byKey.get(seq[0]!)!;
        fails.push(`${showTitle(lead.guide.showRatingKey!)} "${lead.guide.title}" (${seq.length} parts) — NOT contiguous`);
      }
    }
    const pass = v.keep ? ok === runSeqs.length : true; // control isn't expected to pass; just report
    console.log(`${v.keep && ok === runSeqs.length ? green("✓") : v.keep ? red("✗") : " "} ${v.label}`);
    console.log(`    ${ok}/${runSeqs.length} runs contiguous${v.keep ? "" : "  (control — not expected to keep them together)"}`);
    for (const f of fails.slice(0, 8)) console.log(`      - ${f}`);
    if (fails.length > 8) console.log(`      … and ${fails.length - 8} more`);
    return pass;
  };

  console.log("── Results ──");
  const results = variants.map(check);
  const allPass = results.every(Boolean);
  console.log(`\nVerdict: ${allPass ? green("PASS") : red("FAIL")} — keep-together variants kept every run contiguous.`);

  // Leave the channel in an inspectable state: keep-together ON, plain shuffle — open it in the guide to eyeball.
  await run(channel.id, "final", "SHUFFLE", null, true);
  console.log(`Channel #${num} left as a Manual pool with keep-together ON (plain shuffle) for manual inspection.`);
  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Test crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
