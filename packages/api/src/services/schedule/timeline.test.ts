import { describe, expect, test } from "bun:test";

import type { PlexItem } from "../plex/client";
import { type ChannelStrategy, buildSchedule } from "./timeline";

// ── fixtures ────────────────────────────────────────────────────────────────

function ep(show: string, n: number, mins = 30): PlexItem {
  return {
    ratingKey: `${show}-e${n}`,
    title: `${show} ${n}`,
    durationMs: mins * 60_000,
    guide: { title: `${show} ${n}`, type: "episode", showRatingKey: show },
  };
}
function movie(id: string, mins = 100): PlexItem {
  return { ratingKey: `m-${id}`, title: id, durationMs: mins * 60_000, guide: { title: id, type: "movie" } };
}
function titledMovie(rk: string, title: string, year: number, mins = 120): PlexItem {
  return { ratingKey: rk, title, durationMs: mins * 60_000, year, guide: { title, type: "movie", year } };
}
function show(name: string, count: number, mins = 30): PlexItem[] {
  return Array.from({ length: count }, (_, i) => ep(name, i + 1, mins));
}

/** ratingKeys of the PROGRAM slots of a single-pass (uncapped, min=1, no bumpers) build. */
function passKeys(pool: PlexItem[], ordering: "SHUFFLE" | "IN_ORDER" | "BY_AIR_DATE", strategy: ChannelStrategy | null) {
  const build = buildSchedule(pool, ordering, 12345, new Date("2026-01-01T00:00:00Z"), 1, null, { strategy });
  return build.entries.filter((e) => e.kind === "PROGRAM").map((e) => e.ratingKey!);
}

/** Compress a key sequence into blocks of the same show (group prefix before "-"). */
function showBlocks(keys: string[]): string[] {
  const showOf = (k: string) => (k.startsWith("m-") ? k : k.split("-")[0]!);
  const blocks: string[] = [];
  for (const k of keys) {
    const s = showOf(k);
    if (blocks[blocks.length - 1] !== s) blocks.push(s);
  }
  return blocks;
}

// ── tests ───────────────────────────────────────────────────────────────────

describe("channel strategies", () => {
  test("no strategy leaves the pass unchanged + deterministic", () => {
    const pool = [...show("A", 5), ...show("B", 5)];
    const a = passKeys(pool, "IN_ORDER", null);
    const b = passKeys(pool, "IN_ORDER", null);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...pool.map((p) => p.ratingKey)].sort()); // every item once
  });

  test("clustered = each show's episodes contiguous, in base order", () => {
    const pool = [...show("A", 4), ...show("B", 4), ...show("C", 4)];
    const strat: ChannelStrategy = { rotation: "clustered", grouping: [{ scope: "show", run: "all" }] };
    const keys = passKeys(pool, "IN_ORDER", strat);
    expect([...keys].sort()).toEqual([...pool.map((p) => p.ratingKey)].sort());
    // exactly 3 blocks (one per show), and A's episodes are in order within its block
    expect(showBlocks(keys)).toHaveLength(3);
    const aKeys = keys.filter((k) => k.startsWith("A-"));
    expect(aKeys).toEqual(["A-e1", "A-e2", "A-e3", "A-e4"]);
  });

  test("round_robin never repeats a show across a block seam (equal pools)", () => {
    const pool = [...show("A", 6), ...show("B", 6), ...show("C", 6)];
    const strat: ChannelStrategy = {
      rotation: "round_robin",
      rotationOrder: "shuffle",
      grouping: [{ scope: "show", run: [2, 2] }],
    };
    const keys = passKeys(pool, "IN_ORDER", strat);
    expect([...keys].sort()).toEqual([...pool.map((p) => p.ratingKey)].sort());
    const blocks = showBlocks(keys);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i]).not.toBe(blocks[i - 1]!);
    // in_order continues each show across its blocks (doesn't restart)
    expect(keys.filter((k) => k.startsWith("A-"))).toEqual(["A-e1", "A-e2", "A-e3", "A-e4", "A-e5", "A-e6"]);
  });

  test("duration runs are length-aware: short show gets more per block than a long one", () => {
    const pool = [...show("Sh", 20, 7), ...show("Lo", 20, 45)]; // 7-min vs 45-min episodes
    const strat: ChannelStrategy = {
      rotation: "round_robin",
      rotationOrder: "cycle",
      grouping: [{ scope: "show", run: { minutes: [25, 55] } }],
    };
    const keys = passKeys(pool, "IN_ORDER", strat);
    const blocks: { show: string; size: number }[] = [];
    for (const k of keys) {
      const s = k.split("-")[0]!;
      const last = blocks[blocks.length - 1];
      if (last && last.show === s) last.size++;
      else blocks.push({ show: s, size: 1 });
    }
    const firstShort = blocks.find((b) => b.show === "Sh")!;
    const firstLong = blocks.find((b) => b.show === "Lo")!;
    expect(firstShort.size).toBeGreaterThanOrEqual(3); // ~25–55 min of 7-min eps
    expect(firstLong.size).toBeLessThanOrEqual(2); // one 45-min ep already fills the block
  });

  test("windowed build + resume === one uncapped build (cursor resume under strategy)", () => {
    const pool = [...show("A", 8), ...show("B", 8), ...show("C", 8)];
    const strat: ChannelStrategy = { rotation: "round_robin", grouping: [{ scope: "show", run: [2, 3] }] };
    const full = passKeys(pool, "IN_ORDER", strat);

    // Rebuild the same pass in ~2-item windows, resuming from the cursor each time.
    const seed = 12345;
    const window = 2 * 30 * 60; // ~2 episodes
    let start = new Date("2026-01-01T00:00:00Z");
    let cursor: ReturnType<typeof buildSchedule>["cursor"] | null = null;
    const chunks: string[] = [];
    for (let i = 0; i < 100 && chunks.length < full.length; i++) {
      const b = buildSchedule(pool, "IN_ORDER", seed, start, 1, null, {
        maxDurationSeconds: window,
        resumeFrom: cursor,
        strategy: strat,
      });
      const keys = b.entries.filter((e) => e.kind === "PROGRAM").map((e) => e.ratingKey!);
      if (keys.length === 0) break;
      chunks.push(...keys);
      cursor = b.cursor;
      const last = b.entries[b.entries.length - 1]!;
      start = new Date(last.startsAt.getTime() + last.durationSeconds * 1000);
    }
    expect(chunks.slice(0, full.length)).toEqual(full);
  });

  test("collection filter groups a carve-out as one contiguous marathon block (first-match precedence)", () => {
    const sw = [
      titledMovie("sw-1", "Star Wars: A New Hope", 1977),
      titledMovie("sw-2", "Star Wars: The Empire Strikes Back", 1980),
      titledMovie("sw-3", "Star Wars: Return of the Jedi", 1983),
    ];
    const pool = [...show("A", 4), ...sw, movie("x1"), movie("x2")];
    const strat: ChannelStrategy = {
      rotation: "round_robin",
      grouping: [
        { scope: "collection", run: "all", filter: { titleContains: "Star Wars" } }, // claims sw-* first
        { scope: "show", run: [1, 1] },
        { scope: "movie", run: [1, 1] }, // the OTHER movies (x1/x2), not the SW films
      ],
    };
    const keys = passKeys(pool, "IN_ORDER", strat);
    expect([...keys].sort()).toEqual([...pool.map((p) => p.ratingKey)].sort());
    // the three SW films are contiguous (one marathon) and in base (release) order
    const swIdx = keys.map((k, i) => (k.startsWith("sw-") ? i : -1)).filter((i) => i >= 0);
    expect(swIdx).toHaveLength(3);
    expect(swIdx[2]! - swIdx[0]!).toBe(2); // contiguous
    expect(keys.slice(swIdx[0]!, swIdx[0]! + 3)).toEqual(["sw-1", "sw-2", "sw-3"]);
  });

  test("noRepeatWithin (count) spaces same-show blocks apart", () => {
    const pool = [...show("A", 6), ...show("B", 6), ...show("C", 6), ...show("D", 6)];
    const strat: ChannelStrategy = {
      rotation: "round_robin",
      grouping: [{ scope: "show", run: [1, 1] }],
      constraints: { noRepeatWithin: { count: 3 } },
    };
    const keys = passKeys(pool, "IN_ORDER", strat);
    expect([...keys].sort()).toEqual([...pool.map((p) => p.ratingKey)].sort());
    const lastSeen: Record<string, number> = {};
    keys.forEach((k, i) => {
      const s = k.split("-")[0]!;
      if (lastSeen[s] !== undefined) expect(i - lastSeen[s]!).toBeGreaterThanOrEqual(3);
      lastSeen[s] = i;
    });
  });

  test("noRepeatWithin relaxes on a tiny pool (never stalls or drops items)", () => {
    const pool = [...show("A", 4), ...show("B", 4)]; // only 2 groups
    const strat: ChannelStrategy = {
      rotation: "round_robin",
      grouping: [{ scope: "show", run: [1, 1] }],
      constraints: { noRepeatWithin: { count: 10 } }, // impossible to honor with 2 groups
    };
    const keys = passKeys(pool, "IN_ORDER", strat);
    expect(keys).toHaveLength(8);
    expect([...keys].sort()).toEqual([...pool.map((p) => p.ratingKey)].sort()); // every item once
  });

  test("constrained build resumes across a PASS boundary (recent cursor threading)", () => {
    const pool = [...show("A", 2), ...show("B", 2), ...show("C", 2)]; // 6 items, one pass = ~3h
    const strat: ChannelStrategy = {
      rotation: "round_robin",
      grouping: [{ scope: "show", run: [1, 1] }],
      constraints: { noRepeatWithin: { count: 2 } },
    };
    const seed = 999;
    const start0 = new Date("2026-01-01T00:00:00Z");
    // Uncapped ~2 passes (one pass = 6 × 30min = 10800s).
    const fullBuild = buildSchedule(pool, "IN_ORDER", seed, start0, 20000, null, { strategy: strat });
    const full = fullBuild.entries.filter((e) => e.kind === "PROGRAM").map((e) => e.ratingKey!);
    expect(full.length).toBeGreaterThan(6); // actually crosses the pass boundary

    // Rebuild in ~2-item windows, resuming from the cursor (which now carries `recent`).
    const window = 2 * 30 * 60;
    let start = start0;
    let cursor: ReturnType<typeof buildSchedule>["cursor"] | null = null;
    const chunks: string[] = [];
    for (let i = 0; i < 200 && chunks.length < full.length; i++) {
      const b = buildSchedule(pool, "IN_ORDER", seed, start, 1, null, {
        maxDurationSeconds: window,
        resumeFrom: cursor,
        strategy: strat,
      });
      const keys = b.entries.filter((e) => e.kind === "PROGRAM").map((e) => e.ratingKey!);
      if (keys.length === 0) break;
      chunks.push(...keys);
      cursor = b.cursor;
      const last = b.entries[b.entries.length - 1]!;
      start = new Date(last.startsAt.getTime() + last.durationSeconds * 1000);
    }
    expect(chunks.slice(0, full.length)).toEqual(full); // identical across the pass seam
  });

  test("movies rule keeps movies as a rotating group alongside shows", () => {
    const pool = [...show("A", 4), ...Array.from({ length: 4 }, (_, i) => movie(`${i + 1}`))];
    const strat: ChannelStrategy = {
      rotation: "round_robin",
      grouping: [
        { scope: "show", run: [1, 1] },
        { scope: "movie", run: [1, 1] },
      ],
    };
    const keys = passKeys(pool, "IN_ORDER", strat);
    expect([...keys].sort()).toEqual([...pool.map((p) => p.ratingKey)].sort());
    const blocks = showBlocks(keys);
    for (let i = 1; i < blocks.length; i++) expect(blocks[i]).not.toBe(blocks[i - 1]!);
  });
});
