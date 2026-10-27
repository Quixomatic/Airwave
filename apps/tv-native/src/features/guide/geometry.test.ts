/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import fixture from "../../../../../packages/native-guide/android/src/test/resources/geometry-fixture.json";
import {
  ART_MAX,
  artBox,
  artUrl,
  cellBox,
  isVisible,
  liveFill,
  liveProgramIndex,
  MIN,
  programArtPath,
  SOURCE_CULL_GAP,
  timelineOrigin,
  WINDOW_MIN,
  type Lane,
} from "./geometry";

// Local-time dates throughout, since `timelineOrigin` snaps on the local clock.
const T0 = new Date(2026, 2, 18, 19, 1);
const at = (startMin: number, durMin: number) => ({
  startsAt: new Date(T0.getTime() + startMin * MIN).toISOString(),
  durationSeconds: durMin * 60,
});
// 720 dp across 180 minutes = exactly 4 dp per minute, so the expected numbers below are easy to follow.
const lane = (gap = 6, laneW = 720): Lane => ({ T0, ppm: laneW / WINDOW_MIN, laneW, gap });

describe("timelineOrigin", () => {
  // [day, hour, minute, second, ms] of the snapped origin for a `now` at 18 March h:m:42.5
  const origin = (h: number, m: number) => {
    const d = timelineOrigin(new Date(2026, 2, 18, h, m, 42, 500));
    return [d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()];
  };

  test("snaps the lead-in back to :01 or :31", () => {
    expect(origin(19, 0)).toEqual([18, 18, 1, 0, 0]); // 18:30 -> 18:01
    expect(origin(19, 1)).toEqual([18, 18, 31, 0, 0]); // 18:31 -> 18:31
    expect(origin(19, 31)).toEqual([18, 19, 1, 0, 0]); // 19:01 -> 19:01
    expect(origin(19, 59)).toEqual([18, 19, 1, 0, 0]); // 19:29 -> 19:01
  });

  test("a lead-in that lands exactly on :00 goes back to :31 of the previous hour", () => {
    expect(origin(19, 30)).toEqual([18, 18, 31, 0, 0]);
  });

  test("rolls back across midnight", () => {
    expect(origin(0, 10)).toEqual([17, 23, 31, 0, 0]); // 23:40 the day before -> 23:31
    expect(origin(0, 30)).toEqual([17, 23, 31, 0, 0]); // 00:00 -> 23:31 the day before
    expect(origin(0, 0)).toEqual([17, 23, 1, 0, 0]); // 23:30 the day before -> 23:01
  });
});

describe("cellBox", () => {
  test("places a cell at its start, less the gap on its right edge", () => {
    expect(cellBox(at(30, 60), lane())).toEqual({ left: 120, width: 234 });
  });

  test("a program that began before the rail starts at the gap", () => {
    expect(cellBox(at(-20, 50), lane())).toEqual({ left: 6, width: 108 });
    expect(cellBox(at(-20, 50), lane(3))).toEqual({ left: 3, width: 114 });
  });

  test("skips programs that ended at the rail or start at the window's end", () => {
    expect(cellBox(at(-60, 60), lane())).toBeNull(); // ends exactly at the rail
    expect(cellBox(at(-60, 70), lane())).not.toBeNull();
    expect(cellBox(at(WINDOW_MIN, 30), lane())).toBeNull();
    expect(cellBox(at(WINDOW_MIN - 0.5, 30), lane())).not.toBeNull();
    expect(cellBox({ startsAt: "not a date", durationSeconds: 1800 }, lane())).toBeNull();
  });

  test("skips slivers narrower than 8 dp", () => {
    // Clamped at the rail, what's left of these programs is 4, 7.6, 8 and 12 dp wide.
    expect(cellBox(at(-10, 14), lane())).toBeNull();
    expect(cellBox(at(-10, 14.9), lane())).toBeNull();
    expect(cellBox(at(-10, 15), lane())).toEqual({ left: 6, width: 8 });
    expect(cellBox(at(-10, 16), lane())).toEqual({ left: 6, width: 12 });
  });

  test("gives a very short program the minimum width (2% of the lane)", () => {
    // One minute is 4 dp at this scale. The floor makes it 14.4 - 6 gap, so it survives the 8 dp cut...
    const box = cellBox(at(60, 1), lane());
    expect(box?.left).toBe(240);
    expect(box?.width).toBeCloseTo(8.4, 10);
    // ...unless the lane is narrow enough that the floor itself is a sliver.
    expect(cellBox(at(60, 1), lane(6, 500))).toBeNull();
  });

  test("isVisible is cellBox !== null at SOURCE_CULL_GAP, whatever the lane's gap", () => {
    for (const gap of [3, 6]) {
      for (const [start, dur] of [[30, 60], [-60, 60], [-10, 14], [-10, 16], [-10, 18], [60, 1], [WINDOW_MIN, 30]] as const) {
        expect(isVisible(at(start, dur), lane(gap))).toBe(cellBox(at(start, dur), lane(SOURCE_CULL_GAP)) !== null);
      }
    }
  });
});

describe("the source and Row cull gap", () => {
  // The per-channel filter as AuroraGrid spelled it before the geometry moved here: its gap is the literal 6, while each
  // Row places its cells with cs(6), which is 3 on Android TV (its layout space is ~960 dp).
  const oldSourceCull = (p: ReturnType<typeof at>, { ppm, laneW }: Lane): boolean => {
    const start = (new Date(p.startsAt).getTime() - T0.getTime()) / MIN;
    if (!(start + p.durationSeconds / 60 > 0 && start < WINDOW_MIN)) return false;
    const rawLeft = start * ppm;
    const rawRight = rawLeft + Math.max(laneW * 0.02, (p.durationSeconds / 60) * ppm) - 6;
    return rawRight - (rawLeft < 0 ? 6 : rawLeft) >= 8;
  };
  const sweep = (fn: (start: number, dur: number) => void) => {
    for (let start = -120; start <= 200; start += 0.5) {
      for (const dur of [0.5, 1, 2, 3, 3.5, 4, 5, 10, 14, 15, 16, 20, 30, 60, 180]) fn(start, dur);
    }
  };

  test("isVisible keeps exactly the programs the old filter kept, with a lane gap of 6 (iPad, Apple TV) or 3 (Android TV)", () => {
    for (const gap of [3, 6]) {
      sweep((start, dur) => expect(isVisible(at(start, dur), lane(gap))).toBe(oldSourceCull(at(start, dur), lane(gap))));
    }
  });

  test("on Android TV the filter still drops the program clamped at the rail edge that a Row would draw", () => {
    // 16 dp of the program is past the rail. The filter takes 6 off each side and sees 4, so it removes the program,
    // though cellBox at the Row's gap of 3 would make a 10 dp cell. Kept as it was.
    expect(isVisible(at(-10, 14), lane(3))).toBe(false);
    expect(oldSourceCull(at(-10, 14), lane(3))).toBe(false);
    expect(cellBox(at(-10, 14), lane(3))).toEqual({ left: 3, width: 10 });
  });

  test("a program the filter keeps always gets a cell in its Row", () => {
    sweep((start, dur) => {
      if (isVisible(at(start, dur), lane(3))) expect(cellBox(at(start, dur), lane(3))).not.toBeNull();
    });
  });
});

describe("liveFill", () => {
  test("is how far now is across the cell", () => {
    expect(liveFill(150, 100, 200)).toBe(0.25);
    expect(liveFill(200, 100, 200)).toBe(0.5);
  });

  test("clamps to 0 before the cell and 1 after it", () => {
    expect(liveFill(50, 100, 200)).toBe(0);
    expect(liveFill(100, 100, 200)).toBe(0);
    expect(liveFill(300, 100, 200)).toBe(1);
    expect(liveFill(900, 100, 200)).toBe(1);
  });
});

describe("liveProgramIndex", () => {
  const nowMs = T0.getTime();
  const programs = [at(-60, 30), at(-30, 60), at(30, 30)];

  test("finds the airing program; its start is inclusive and its end exclusive", () => {
    expect(liveProgramIndex(programs, nowMs)).toBe(1);
    expect(liveProgramIndex(programs, nowMs + 30 * MIN)).toBe(2);
    expect(liveProgramIndex(programs, nowMs - 30 * MIN)).toBe(1);
  });

  test("falls back to 0 when nothing is airing", () => {
    expect(liveProgramIndex(programs, nowMs - 500 * MIN)).toBe(0);
    expect(liveProgramIndex([], nowMs)).toBe(0);
  });
});

describe("artBox", () => {
  test("rounds the drawn pixel size up to a multiple of 64", () => {
    expect(artBox(100, 40, 2)).toEqual({ w: 256, h: 128 });
    expect(artBox(32, 32, 2)).toEqual({ w: 64, h: 64 });
  });

  test("is never smaller than what is drawn (up to the cap), and nearby sizes share a request", () => {
    for (let w = 20; w < 700; w += 7.3) expect(artBox(w, 40, 2.625).w).toBeGreaterThanOrEqual(Math.min(ART_MAX, Math.ceil(w * 2.625)));
    expect(artBox(100.2, 40, 2)).toEqual(artBox(100.9, 40, 2));
  });

  test("caps the request and keeps a minimum of one step", () => {
    expect(artBox(4000, 4000, 2)).toEqual({ w: ART_MAX, h: ART_MAX });
    expect(ART_MAX).toBe(1024); // a wide cell's cover-scaled picture is as wide as the request: see ART_MAX
    expect(artBox(512, 60, 2)).toEqual({ w: 1024, h: 128 }); // exactly the cap is not rounded past it
    expect(artBox(900, 60, 2)).toEqual({ w: 1024, h: 128 }); // a lane-wide cell asks for the cap, not its full width
    expect(artBox(0, 0.1, 2)).toEqual({ w: 64, h: 64 });
    expect(artBox(40, 53, 2, 32)).toEqual({ w: 96, h: 128 });
  });
});

// packages/native-guide's Kotlin tests read this same file. When geometry.ts changes, regenerate it with
// `bun packages/native-guide/scripts/gen-geometry-fixture.ts`.
describe("programArtPath", () => {
  test("prefers the landscape art, then the thumb", () => {
    expect(programArtPath({ art: "/library/metadata/1/art/9", thumb: "/library/metadata/1/thumb/9" })).toBe("/library/metadata/1/art/9");
    expect(programArtPath({ thumb: "/library/metadata/1/thumb/9" })).toBe("/library/metadata/1/thumb/9");
    expect(programArtPath({ art: "", thumb: "/library/metadata/1/thumb/9" })).toBe("/library/metadata/1/thumb/9");
  });

  test("is null for neither", () => {
    expect(programArtPath({})).toBeNull();
    expect(programArtPath({ art: "", thumb: null })).toBeNull();
  });
});

describe("artUrl", () => {
  test("appends the pixel box to the query the image route already has", () => {
    expect(artUrl("https://s.example/img/c1?path=%2Flibrary%2Fx", { w: 256, h: 128 })).toBe("https://s.example/img/c1?path=%2Flibrary%2Fx&w=256&h=128");
  });

  test("starts a query when there is none", () => {
    expect(artUrl("https://s.example/img/c1", { w: 64, h: 64 })).toBe("https://s.example/img/c1?w=64&h=64");
  });

  test("two cells that bucket to one box request one URL", () => {
    const base = "https://s.example/img/c1?path=%2Flibrary%2Fx";
    expect(artUrl(base, artBox(100.2, 40, 2))).toBe(artUrl(base, artBox(100.9, 40, 2)));
  });
});

describe("geometry fixture", () => {
  const lanes = (c: { originMs: number; ppm: number; laneW: number; gap: number }): Lane => ({
    T0: new Date(c.originMs),
    ppm: c.ppm,
    laneW: c.laneW,
    gap: c.gap,
  });

  test("cellBox reproduces every case", () => {
    expect(fixture.cells.length).toBeGreaterThan(100);
    fixture.cells.forEach((c, i) => {
      const program = { startsAt: new Date(c.in.startMs).toISOString(), durationSeconds: c.in.durationSeconds };
      expect({ i, box: cellBox(program, lanes(c.in)) }).toEqual({ i, box: c.out });
    });
  });

  test("isVisible reproduces every case", () => {
    fixture.cells.forEach((c, i) => {
      const program = { startsAt: new Date(c.in.startMs).toISOString(), durationSeconds: c.in.durationSeconds };
      expect({ i, kept: isVisible(program, lanes(c.in)) }).toEqual({ i, kept: c.kept });
    });
  });

  test("liveFill reproduces every case", () => {
    fixture.liveFills.forEach((c, i) => expect({ i, out: liveFill(c.in.nowX, c.in.left, c.in.width) }).toEqual({ i, out: c.out }));
  });

  test("artUrl reproduces every case", () => {
    expect(fixture.artUrls.length).toBeGreaterThan(0);
    fixture.artUrls.forEach((c, i) => expect({ i, out: artUrl(c.in.base, { w: c.in.w, h: c.in.h }) }).toEqual({ i, out: c.out }));
  });

  test("artBox reproduces every case", () => {
    fixture.artBoxes.forEach((c, i) => expect({ i, out: artBox(c.in.w, c.in.h, c.in.ratio, c.in.step) }).toEqual({ i, out: c.out }));
  });
});
