/**
 * Detect (and optionally repair) corrupted channel schedules: rows that share a start time or whose
 * times overlap. This is the damage the old concurrency race left behind (e.g. a dev hot-reload firing
 * two builds at once that both appended the same block). The per-channel build lock (#57) prevents new
 * corruption; this script finds and cleans up what's already there.
 *
 * Detect-only by default (safe, read-only). With --fix it repairs each dirty channel by regenerating its
 * schedule (a full wipe + fresh rebuild via generateChannelSchedule, which is atomic and lock-guarded),
 * then re-scans to confirm it's clean.
 *
 *   # scan every channel, report only
 *   cd apps/server && bun --env-file=.env run scripts/probe-schedule-overlaps.ts
 *   # scan + repair every dirty channel
 *   cd apps/server && bun --env-file=.env run scripts/probe-schedule-overlaps.ts --fix
 *   # just one channel (by id or number), optionally with --fix
 *   cd apps/server && bun --env-file=.env run scripts/probe-schedule-overlaps.ts --channel 1102 [--fix]
 */
import prisma from "@airwave/db";

import { generateChannelSchedule } from "@airwave/api/services/schedule/generate";

const argv = process.argv.slice(2);
const FIX = argv.includes("--fix");
const chanArg = (() => {
  const i = argv.indexOf("--channel");
  return i >= 0 ? argv[i + 1] : undefined;
})();

type Row = { startsAt: Date; durationSeconds: number };

/** Count duplicate start times and time-overlaps in a start-ordered row list. */
function scan(rows: Row[]) {
  let dups = 0;
  let overlaps = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!;
    const b = rows[i]!;
    const aEnd = a.startsAt.getTime() + a.durationSeconds * 1000;
    if (b.startsAt.getTime() === a.startsAt.getTime()) dups++;
    else if (aEnd > b.startsAt.getTime()) overlaps++;
  }
  return { dups, overlaps, bad: dups + overlaps, rows: rows.length };
}

async function schedRows(channelId: string): Promise<Row[]> {
  return prisma.scheduleItem.findMany({
    where: { channelId },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, durationSeconds: true },
  });
}

async function main() {
  const channels = chanArg
    ? await prisma.channel
        .findUnique({
          where: /^\d+$/.test(chanArg) ? { number: Number(chanArg) } : { id: chanArg },
          select: { id: true, number: true, name: true },
        })
        .then((c) => (c ? [c] : []))
    : await prisma.channel.findMany({
        select: { id: true, number: true, name: true },
        orderBy: { number: "asc" },
      });

  if (channels.length === 0) {
    console.error(chanArg ? `No channel found for "${chanArg}".` : "No channels found.");
    process.exit(1);
  }

  console.log(`Scanning ${channels.length} channel(s)${FIX ? " (repair mode)" : " (detect only)"}…\n`);

  const dirty: { id: string; number: number | null; name: string; dups: number; overlaps: number; rows: number }[] = [];
  for (const ch of channels) {
    const s = scan(await schedRows(ch.id));
    if (s.bad > 0) {
      dirty.push({ id: ch.id, number: ch.number, name: ch.name, dups: s.dups, overlaps: s.overlaps, rows: s.rows });
      console.log(
        `  \x1b[31m✗\x1b[0m #${ch.number} "${ch.name}" — ${s.rows} rows, ${s.dups} duplicate-starts, ${s.overlaps} overlaps`,
      );
    }
  }

  if (dirty.length === 0) {
    console.log("  \x1b[32m✓\x1b[0m All scanned channels are clean (no duplicates or overlaps).");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n${dirty.length} channel(s) with corrupted schedules.`);

  if (!FIX) {
    console.log("Re-run with --fix to repair them (wipes + regenerates each dirty channel's schedule).");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("\nRepairing (regenerate = wipe + fresh build, atomic + lock-guarded)…");
  let fixed = 0;
  let stillBad = 0;
  for (const ch of dirty) {
    try {
      const summary = await generateChannelSchedule(prisma, ch.id);
      const after = scan(await schedRows(ch.id));
      if (after.bad === 0) {
        fixed++;
        console.log(`  \x1b[32m✓\x1b[0m #${ch.number} "${ch.name}" — rebuilt ${summary.itemCount} items, now clean`);
      } else {
        stillBad++;
        console.log(
          `  \x1b[31m✗\x1b[0m #${ch.number} "${ch.name}" — STILL dirty after rebuild (${after.dups} dups, ${after.overlaps} overlaps) — investigate`,
        );
      }
    } catch (err) {
      stillBad++;
      console.log(`  \x1b[31m✗\x1b[0m #${ch.number} "${ch.name}" — rebuild failed: ${String(err)}`);
    }
  }

  console.log(`\nRepaired ${fixed}/${dirty.length} channel(s).${stillBad ? ` ${stillBad} still need attention.` : ""}`);
  await prisma.$disconnect();
  process.exit(stillBad === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Probe crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
