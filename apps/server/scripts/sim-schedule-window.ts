/**
 * Windowed-schedule harness — exercises `buildSchedule`'s window cap + resume cursor
 * against synthetic pools, so the tricky cases (mid-pass truncation, resuming without
 * repeats or gaps, rolling over into a fresh pass, a stale cursor after the pool shrank)
 * can be checked without touching Plex or the DB.
 *
 *   bun --env-file=.env run scripts/sim-schedule-window.ts
 *
 * Background: an uncapped build lays one FULL pass of the pool — for a 2,800-episode
 * channel that's ~300 days, far too slow to run inline when a channel is created. A
 * windowed build (`maxDurationSeconds`) stops early, mid-pass, and returns a cursor the
 * next build resumes from. Without the cursor an IN_ORDER channel would replay the top
 * of its pool on every extend and never reach episode 50.
 */
import {
  type ScheduleCursor,
  buildSchedule,
} from "@airwave/api/services/schedule/timeline";

const H = 3600;
const START = new Date("2026-07-19T12:00:00Z");

/** A synthetic pool of `n` items, each `mins` long. */
function pool(n: number, mins: number) {
  return Array.from({ length: n }, (_, i) => ({
    ratingKey: String(1000 + i),
    title: `Item ${i}`,
    durationMs: mins * 60_000,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any[];
}

/** Program ratingKeys in schedule order (bumpers dropped). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function progs(build: any): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return build.entries.filter((e: any) => e.kind === "PROGRAM").map((e: any) => e.ratingKey);
}

function ok(pass: boolean) {
  return pass ? "PASS" : "**FAIL**";
}

const big = pool(500, 30); // 500 × 30min = 250h
const small = pool(4, 60); // 4h — short enough to walk past the end quickly

console.log("=== 1. Uncapped build is UNCHANGED (one full pass, every item once) ===");
const full = buildSchedule(big, "SHUFFLE", 123, START, 7 * 24 * H, null);
console.log(
  `programs=${progs(full).length} passes=${full.passes} covered=${(full.coveredSeconds / H).toFixed(0)}h`,
);
console.log(
  `every item exactly once: ${ok(progs(full).length === 500 && new Set(progs(full)).size === 500)}`,
);
console.log(`ends on a clean pass boundary (pos 0): ${ok(full.cursor.pos === 0)}\n`);

console.log("=== 2. Windowed build stops mid-pass at ~12h ===");
const w1 = buildSchedule(big, "SHUFFLE", 123, START, 7 * 24 * H, null, {
  maxDurationSeconds: 12 * H,
});
console.log(
  `programs=${progs(w1).length} covered=${(w1.coveredSeconds / H).toFixed(1)}h cursor=${JSON.stringify(w1.cursor)}`,
);
console.log(`much cheaper than the full 500: ${ok(progs(w1).length < 50)}`);
console.log(`covers the window: ${ok(w1.coveredSeconds >= 12 * H)}\n`);

console.log("=== 3. Resume continues the pass — no repeats, no gaps ===");
const tail = new Date(START.getTime() + w1.coveredSeconds * 1000);
const w2 = buildSchedule(big, "SHUFFLE", 123, tail, 7 * 24 * H, null, {
  maxDurationSeconds: 12 * H,
  resumeFrom: w1.cursor,
});
const overlap = progs(w1).filter((k) => progs(w2).includes(k));
console.log(`block2 programs=${progs(w2).length} cursor=${JSON.stringify(w2.cursor)}`);
console.log(`no item aired twice across the two blocks: ${ok(overlap.length === 0)}`);
console.log(
  `cursor advanced by exactly what block2 laid: ${ok(w2.cursor.pos - w1.cursor.pos === progs(w2).length)}\n`,
);

console.log("=== 4. IN_ORDER walks THROUGH the pool (the case the cursor exists for) ===");
const io1 = buildSchedule(big, "IN_ORDER", 123, START, 7 * 24 * H, null, {
  maxDurationSeconds: 12 * H,
});
const io2 = buildSchedule(big, "IN_ORDER", 123, tail, 7 * 24 * H, null, {
  maxDurationSeconds: 12 * H,
  resumeFrom: io1.cursor,
});
const lastOf1 = Number(progs(io1).at(-1));
const firstOf2 = Number(progs(io2)[0]);
console.log(`block1 ends at ${lastOf1}, block2 starts at ${firstOf2}`);
console.log(`contiguous (did NOT replay from the top): ${ok(firstOf2 === lastOf1 + 1)}\n`);

console.log("=== 5. Running off the end rolls into a BRAND-NEW pass from 0 ===");
let cur: ScheduleCursor | null = null;
let at = START;
const laid: string[][] = [];
for (let i = 0; i < 3; i++) {
  const b = buildSchedule(small, "SHUFFLE", 77, at, 7 * 24 * H, null, {
    maxDurationSeconds: 3 * H,
    resumeFrom: cur,
  });
  laid.push(progs(b));
  console.log(
    `block${i}: items=[${progs(b).join(", ")}] -> pass=${b.cursor.passIndex} pos=${b.cursor.pos}`,
  );
  cur = b.cursor;
  at = new Date(at.getTime() + b.coveredSeconds * 1000);
}
console.log(`pass index advanced past the pool: ${ok((cur as ScheduleCursor).passIndex >= 2)}`);
// Across a full cycle every item should air; a reshuffled new pass may legitimately
// repeat an item across the seam (pass N's last == pass N+1's first) — that's the
// pre-existing pass-boundary behaviour of the uncapped builder too, not a windowing bug.
const cycle = new Set(laid.flat());
console.log(`every item aired within 3 blocks: ${ok(cycle.size === 4)}\n`);

console.log("=== 6. A stale cursor (pool shrank under it) must not wedge ===");
const stale = buildSchedule(small, "SHUFFLE", 77, START, 7 * 24 * H, null, {
  maxDurationSeconds: 3 * H,
  resumeFrom: { passSeed: 42, passIndex: 5, pos: 999 },
});
console.log(`programs=${progs(stale).length} cursor=${JSON.stringify(stale.cursor)}`);
console.log(`still produced a schedule: ${ok(progs(stale).length > 0)}`);
console.log(`rolled to a fresh pass rather than laying nothing: ${ok(stale.cursor.passIndex >= 6)}`);
