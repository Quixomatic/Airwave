/**
 * END-TO-END test of "keep multi-part episodes together" (issue #37) against a real generated schedule.
 *
 * Reconfigures a TEST channel (by number, default 3) into a MANUAL pool of SHOWS that have multi-part runs
 * (whole-show picks — the resolver expands each show LIVE to its episodes, exactly like a hand-built manual
 * channel), turns the toggle ON, generates the full schedule through the real pipeline, then checks every
 * multi-part run among the scheduled episodes comes out CONTIGUOUS and IN ORDER. Runs it three ways: plain
 * SHUFFLE, SHUFFLE + a group-by-show round-robin strategy (proving keep-together SUPERSEDES the strategy),
 * and a control with the toggle OFF (to show it actually makes a difference).
 *
 * DESTRUCTIVE to the given channel: it replaces the channel's definition + schedule. Use a throwaway test
 * channel (3 by default). Leaves it as a Manual-of-shows pool with keep-together ON for manual inspection.
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

function toItems(rows: { ratingKey: string; title: string; durationMs: number; guide: unknown }[]): PlexItem[] {
  return rows.map(
    (r) => ({ ratingKey: r.ratingKey, title: r.title, durationMs: r.durationMs, guide: (r.guide ?? {}) as PlexItem["guide"] }),
  );
}

async function generate(channelId: string, ordering: "SHUFFLE", strategy: ChannelStrategy | null, keep: boolean) {
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
  return { seq, pos };
}

async function main() {
  const channel = await prisma.channel.findFirst({ where: { number: num } });
  if (!channel) {
    console.error(`No channel #${num}`);
    process.exit(1);
  }
  console.log(`Using channel #${num} "${channel.name}" (${channel.id}) — THIS REWRITES ITS DEFINITION + SCHEDULE\n`);

  // 1. Find shows that have multi-part runs; pick a varied handful (longest runs first).
  const allRows = await prisma.mediaItem.findMany({
    where: { mediaSourceId: channel.mediaSourceId, type: "episode", available: true },
    select: { ratingKey: true, title: true, durationMs: true, guide: true },
  });
  const byKey = new Map(toItems(allRows).map((i) => [i.ratingKey, i]));
  const showTitleOf = new Map<string, string>();
  for (const r of allRows) {
    const g = (r.guide ?? {}) as { showRatingKey?: string; showTitle?: string };
    if (g.showRatingKey && g.showTitle) showTitleOf.set(g.showRatingKey, g.showTitle);
  }
  const { continuations: allRuns } = groupMultiPartRuns(toItems(allRows));
  const runLen = [...allRuns.entries()].map(([lead, parts]) => ({ show: byKey.get(lead)!.guide.showRatingKey!, len: parts.length + 1 }));
  runLen.sort((a, b) => b.len - a.len);
  const showKeys: string[] = [];
  for (const r of runLen) if (!showKeys.includes(r.show) && showKeys.length < MAX_SHOWS) showKeys.push(r.show);
  console.log(`Pool: ${showKeys.length} SHOWS (whole-show manual picks): ${showKeys.map((s) => showTitleOf.get(s) ?? s).join(", ")}`);

  // 2. Reconfigure the channel to a MANUAL pool of SHOW keys (the resolver expands each to its episodes).
  await prisma.channelDefinition.deleteMany({ where: { channelId: channel.id } });
  await prisma.channelDefinition.create({
    data: { channelId: channel.id, kind: "MANUAL_ITEMS", manualItemKeys: showKeys },
  });

  // 3. Keep-ON (plain shuffle) + derive the expected runs from what ACTUALLY got scheduled.
  const a = await generate(channel.id, "SHUFFLE", null, true);
  const scheduled = [...new Set(a.seq)].map((k) => byKey.get(k)).filter((x): x is PlexItem => !!x);
  const { continuations: expected } = groupMultiPartRuns(scheduled);
  const runSeqs = [...expected.entries()].map(([lead, parts]) => [lead, ...parts.map((p) => p.ratingKey)]);
  console.log(`Scheduled ${a.seq.length} episodes; ${runSeqs.length} multi-part runs within them\n`);

  // 4. The other two variants.
  const groupByShow: ChannelStrategy = { rotation: "round_robin", rotationOrder: "shuffle", grouping: [{ scope: "show", run: 1 }] };
  const b = await generate(channel.id, "SHUFFLE", groupByShow, true);
  const c = await generate(channel.id, "SHUFFLE", null, false);

  // 5. Verify contiguity per variant.
  const check = (label: string, v: { seq: string[]; pos: Map<string, number> }, keep: boolean) => {
    let ok = 0;
    const fails: string[] = [];
    for (const seq of runSeqs) {
      const start = v.pos.get(seq[0]!);
      const contiguous = start != null && seq.every((k, i) => v.seq[start + i] === k);
      if (contiguous) ok++;
      else {
        const lead = byKey.get(seq[0]!)!;
        fails.push(`${showTitleOf.get(lead.guide.showRatingKey!) ?? "?"} "${lead.guide.title}" (${seq.length} parts)`);
      }
    }
    const pass = keep ? ok === runSeqs.length : true;
    console.log(`${keep ? (ok === runSeqs.length ? green("✓") : red("✗")) : " "} ${label}`);
    console.log(`    ${ok}/${runSeqs.length} runs contiguous${keep ? "" : "  (control — not expected to keep them together)"}`);
    for (const f of fails.slice(0, 6)) console.log(`      - ${f}`);
    if (fails.length > 6) console.log(`      … and ${fails.length - 6} more`);
    return pass;
  };

  console.log("── Results ──");
  const pass =
    [
      check("SHUFFLE, no strategy, keep ON", a, true),
      check("SHUFFLE + group-by-show round-robin, keep ON", b, true),
      check("SHUFFLE, no strategy, keep OFF (control)", c, false),
    ].every(Boolean);

  // Leave the channel in an inspectable state: keep-together ON, plain shuffle.
  await generate(channel.id, "SHUFFLE", null, true);
  console.log(`\nVerdict: ${pass ? green("PASS") : red("FAIL")}. Channel #${num} left as a Manual-of-shows pool with keep-together ON.`);
  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Test crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
