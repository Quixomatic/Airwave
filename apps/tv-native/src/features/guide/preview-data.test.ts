/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { MIN } from "./geometry";
import { SAMPLE_CELL_ROW, SAMPLE_CHANNELS, SAMPLE_NOW_MIN, SAMPLE_RAIL_ROW, sampleLineup, sampleNow, sampleOrigin } from "./preview-data";

describe("the sample guide", () => {
  const now = sampleNow(new Date(2026, 9, 26, 3, 0));
  const lineup = sampleLineup(now.getTime());

  test("now is 8:41 PM, and the timeline starts 40 minutes before it", () => {
    expect([now.getHours(), now.getMinutes()]).toEqual([20, 41]);
    expect(sampleOrigin(now.getTime())).toBe(now.getTime() - 40 * MIN);
    expect(SAMPLE_NOW_MIN).toBe(40);
  });

  test("it has six channels, one row with a selected cell and another with its rail", () => {
    expect(lineup).toHaveLength(6);
    expect(SAMPLE_CELL_ROW).not.toBe(SAMPLE_RAIL_ROW);
    expect(lineup[SAMPLE_CELL_ROW]).toBeDefined();
    expect(lineup[SAMPLE_RAIL_ROW]).toBeDefined();
  });

  test("the selected cell's program is on now and carries the featured panel's details", () => {
    const p = lineup[SAMPLE_CELL_ROW]!.programs[0]!;
    const start = new Date(p.startsAt).getTime();
    expect(now.getTime()).toBeGreaterThanOrEqual(start);
    expect(now.getTime()).toBeLessThan(start + p.durationSeconds * 1000);
    expect(p.guide).toMatchObject({ title: "The Long Goodbye", criticRating: 8.1, resolution: "4k", hdr: "HDR10", audioChannels: 6 });
  });

  test("a program is placed by its minutes from the start", () => {
    const first = lineup[0]!.programs[1]!;
    expect(new Date(first.startsAt).getTime()).toBe(sampleOrigin(now.getTime()) + 30 * MIN);
    expect(first.durationSeconds).toBe(30 * 60);
  });

  test("exactly one program has art, and it is marked rather than given an address to fetch", () => {
    const art = lineup.flatMap((c) => c.programs).filter((p) => p.guide.art);
    expect(art).toHaveLength(1);
    expect(art[0]!.guide.art).toBe("sample");
  });

  test("every channel has a lucide icon and programs that do not overlap", () => {
    for (const c of SAMPLE_CHANNELS) {
      expect(c.icon.startsWith("lucide:")).toBe(true);
      for (let i = 1; i < c.programs.length; i++) expect(c.programs[i]!.start).toBeGreaterThanOrEqual(c.programs[i - 1]!.start + c.programs[i - 1]!.length);
    }
  });
});
