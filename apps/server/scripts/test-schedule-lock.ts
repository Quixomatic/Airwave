/**
 * Integration test for the per-channel schedule-build lock (#57) against a LIVE channel + real Plex.
 * Proves that concurrent generate/extend/repair on the same channel serialize and never leave
 * overlapping or duplicate timeline rows, that the fast-fail (ScheduleBusyError) path works, and that
 * the lock column is set during a build and cleared after.
 *
 * Operates ONLY on the channel you pass (by id or number). It CLEARS that channel's schedule as part of
 * the run, so point it at a throwaway/test channel that has a decent filter (so the pool resolves to
 * real items).
 *
 *   cd apps/server && bun --env-file=.env run scripts/test-schedule-lock.ts <channelId | channelNumber>
 */
import prisma from "@airwave/db";

import {
  extendChannelSchedule,
  generateChannelSchedule,
  repairChannelSchedule,
} from "@airwave/api/services/schedule/generate";
import { ScheduleBusyError } from "@airwave/api/services/schedule/lock";

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: bun --env-file=.env run scripts/test-schedule-lock.ts <channelId | channelNumber>");
  process.exit(1);
}

const t0 = Date.now();
const log = (msg: string) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(2)}s] ${msg}`);
const ms = (n: number) => `${n.toFixed(0)}ms`;

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// ---- helpers (reusable) ----------------------------------------------------

async function resolveChannel(idOrNumber: string) {
  const where = /^\d+$/.test(idOrNumber) ? { number: Number(idOrNumber) } : { id: idOrNumber };
  return prisma.channel.findUnique({ where, select: { id: true, number: true, name: true } });
}

async function clearSchedule(channelId: string): Promise<number> {
  const { count } = await prisma.scheduleItem.deleteMany({ where: { channelId } });
  return count;
}

async function scheduleStats(channelId: string) {
  const rows = await prisma.scheduleItem.findMany({
    where: { channelId },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, durationSeconds: true, kind: true },
  });
  return rows;
}

/** Detect duplicate start times and time-overlaps in a channel's schedule (the exact corruption the
 *  lock prevents). Returns the problem list — empty = a clean, contiguous timeline. */
function findOverlaps(rows: { startsAt: Date; durationSeconds: number }[]) {
  const problems: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1]!;
    const cur = rows[i]!;
    const prevEnd = prev.startsAt.getTime() + prev.durationSeconds * 1000;
    if (cur.startsAt.getTime() === prev.startsAt.getTime()) {
      problems.push(`duplicate startsAt at ${cur.startsAt.toISOString()}`);
    } else if (prevEnd > cur.startsAt.getTime()) {
      problems.push(
        `overlap: row ends ${new Date(prevEnd).toISOString()} but next starts ${cur.startsAt.toISOString()}`,
      );
    }
  }
  return problems;
}

async function lockState(channelId: string): Promise<Date | null> {
  const c = await prisma.channel.findUnique({ where: { id: channelId }, select: { scheduleLockedAt: true } });
  return c?.scheduleLockedAt ?? null;
}

async function assertClean(channelId: string, label: string) {
  const rows = await scheduleStats(channelId);
  const problems = findOverlaps(rows);
  check(`${label}: no overlaps/duplicates`, problems.length === 0, `${rows.length} rows, ${problems.length} problems`);
  if (problems.length) problems.slice(0, 5).forEach((p) => console.log(`      - ${p}`));
  const lock = await lockState(channelId);
  check(`${label}: lock released`, lock === null, lock ? `still locked at ${lock.toISOString()}` : "null");
}

// ---- the run ---------------------------------------------------------------

async function main() {
  const channel = await resolveChannel(arg!);
  if (!channel) {
    console.error(`No channel found for "${arg}" (by ${/^\d+$/.test(arg!) ? "number" : "id"}).`);
    process.exit(1);
  }
  log(`Testing channel #${channel.number} "${channel.name}" (${channel.id})`);
  const before = await scheduleStats(channel.id);
  log(`Current schedule: ${before.length} rows. Clearing it for the test…`);
  await clearSchedule(channel.id);

  // Test 1 — single generate (sanity): the build works and leaves a clean schedule. We also record how
  // long ONE build takes, as the baseline for the serialization check in Test 2.
  let singleBuildMs = 0;
  console.log("\n── Test 1: single generate ──");
  {
    const start = performance.now();
    const summary = await generateChannelSchedule(prisma, channel.id);
    singleBuildMs = performance.now() - start;
    log(`generate finished in ${ms(singleBuildMs)} → ${summary.itemCount} items (${summary.programCount} programs)`);
    check("generate produced a schedule", summary.itemCount > 0, `${summary.itemCount} items`);
    await assertClean(channel.id, "Test 1");
  }

  // Test 2 — THE PROOF: fire several concurrent generates on the SAME channel. Without the lock these
  // all read the same tail and append overlapping rows; with it they serialize to a clean schedule.
  console.log("\n── Test 2: 4 concurrent generates (serialize → clean) ──");
  {
    await clearSchedule(channel.id);
    const K = 4;
    const wallStart = performance.now();
    const results = await Promise.all(
      Array.from({ length: K }, (_, i) =>
        generateChannelSchedule(prisma, channel.id, { lockAttempts: 100 }) // generous: let them all queue
          .then((r) => {
            log(`  build ${i} ok at +${ms(performance.now() - wallStart)} (${r.itemCount} items)`);
            return { ok: true as const };
          })
          .catch((e) => {
            log(`  build ${i} threw ${e instanceof ScheduleBusyError ? "ScheduleBusyError" : String(e)}`);
            return { ok: false as const };
          }),
      ),
    );
    const wall = performance.now() - wallStart;
    const okCount = results.filter((r) => r.ok).length;
    check("all concurrent generates completed", okCount === K, `${okCount}/${K} ok`);
    // Serialized ⇒ wall time ≈ K sequential builds. If they'd run in PARALLEL, wall would be ≈ ONE build.
    // So "well more than one build" is the observable signature of the lock. Threshold: at least (K-1)
    // builds' worth of wall time (with 30% slack for jitter/backoff variance).
    check(
      "builds serialized (not parallel)",
      wall >= singleBuildMs * (K - 1) * 0.7,
      `wall ${ms(wall)} vs one build ${ms(singleBuildMs)} (parallel would be ≈1×)`,
    );
    await assertClean(channel.id, "Test 2");
  }

  // Test 3 — fast-fail path: with a 1-try budget, a second concurrent build rejects immediately.
  console.log("\n── Test 3: concurrent with attempts:1 → one busy rejection ──");
  {
    await clearSchedule(channel.id);
    const a = generateChannelSchedule(prisma, channel.id, { lockAttempts: 1 }).then(
      () => "ok",
      (e) => (e instanceof ScheduleBusyError ? "busy" : `err:${e}`),
    );
    const b = generateChannelSchedule(prisma, channel.id, { lockAttempts: 1 }).then(
      () => "ok",
      (e) => (e instanceof ScheduleBusyError ? "busy" : `err:${e}`),
    );
    const [ra, rb] = await Promise.all([a, b]);
    const oks = [ra, rb].filter((r) => r === "ok").length;
    const busies = [ra, rb].filter((r) => r === "busy").length;
    log(`  outcomes: ${ra}, ${rb}`);
    check("exactly one succeeded, one rejected busy", oks === 1 && busies === 1, `${oks} ok / ${busies} busy`);
    await assertClean(channel.id, "Test 3");
  }

  // Test 4 — lock observability: the column is set while a build runs and cleared after.
  console.log("\n── Test 4: lock set during build, cleared after ──");
  {
    await clearSchedule(channel.id);
    const build = generateChannelSchedule(prisma, channel.id);
    // Poll briefly to catch the lock while the build (Plex resolve + build) is in flight.
    let sawLocked = false;
    for (let i = 0; i < 40 && !sawLocked; i++) {
      await new Promise((r) => setTimeout(r, 25));
      if ((await lockState(channel.id)) !== null) sawLocked = true;
    }
    check("lock was observed SET during the build", sawLocked);
    await build;
    check("lock is cleared after the build", (await lockState(channel.id)) === null);
  }

  // Test 5 — mixed concurrency: generate + extend(force) + repair at once, still clean.
  console.log("\n── Test 5: generate + extend + repair concurrently ──");
  {
    await generateChannelSchedule(prisma, channel.id); // ensure a base schedule to extend/repair
    const runs = await Promise.allSettled([
      generateChannelSchedule(prisma, channel.id, { lockAttempts: 100 }),
      extendChannelSchedule(prisma, channel.id, { force: true, lockAttempts: 100 }),
      repairChannelSchedule(prisma, channel.id, { lockAttempts: 100 }),
    ]);
    const settled = runs.map((r) => (r.status === "fulfilled" ? "ok" : "rejected")).join(", ");
    log(`  outcomes: ${settled}`);
    check("all three settled without an unexpected error", runs.every((r) => r.status === "fulfilled"));
    await assertClean(channel.id, "Test 5");
  }

  // Restore a clean schedule so the channel is usable after the test.
  console.log("\n── Cleanup ──");
  await clearSchedule(channel.id);
  await generateChannelSchedule(prisma, channel.id);
  log("Rebuilt a fresh schedule on the channel.");

  console.log(`\n${failed === 0 ? "\x1b[32mALL PASSED\x1b[0m" : "\x1b[31mFAILURES\x1b[0m"}: ${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Test harness crashed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
