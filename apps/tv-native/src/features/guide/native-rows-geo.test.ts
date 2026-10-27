/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import fixture from "../../../../../packages/native-guide/android/src/test/resources/aurora-fixture.json";
import { buildAuroraFixture } from "../../../../../packages/native-guide/scripts/gen-geometry-fixture";
import { WINDOW_MIN } from "./geometry";
import { AURORA } from "./guide-tokens";
import { auroraGeo, ROW_BORDER_TOP, rowTokens, type AuroraGeoInput, type Scalers } from "./native-rows-geo";

// Scalers with round numbers, so each expected value below is easy to follow: 1000 dp wide (a spec px is 0.390625 dp),
// chrome halved, hairlines snapped to half a dp.
const scalers: Scalers = {
  vw: (px) => (px / 2560) * 1000,
  cs: (px) => px * 0.5,
  line: (px) => Math.max(0.5, Math.round(px * 0.5 * 2) / 2),
};
const input: AuroraGeoInput = { rowPx: 65.625, railPx: 74, laneW: 800, ppm: 4, originMs: 1_000, gap: 3, featureScale: 0.76 };

describe("auroraGeo", () => {
  const geo = auroraGeo(input, scalers, AURORA);

  test("carries the lane's coordinate system, as geometry.ts takes it", () => {
    expect(geo).toMatchObject({ rowH: 65.625, railW: 74, laneW: 800, ppm: 4, originMs: 1_000, windowMin: WINDOW_MIN, gap: 3 });
  });

  test("the current time is not part of the geometry: it is its own prop, so a clock tick never rebuilds the layout", () => {
    expect("nowMs" in geo).toBe(false);
    expect(JSON.stringify(auroraGeo({ ...input }, scalers, AURORA))).toBe(JSON.stringify(geo));
  });

  test("sizes are AuroraGrid's own expressions", () => {
    const vw = scalers.vw;
    expect(geo.borderTop).toBe(1); // borderTopWidth: 1, plain dp
    expect(ROW_BORDER_TOP).toBe(1);
    expect(geo.padV).toBe(vw(18));
    expect(geo.padH).toBe(vw(20));
    expect(geo.barW).toBe(vw(4));
    expect(geo.circle).toBe(vw(64 * 0.76));
    expect(geo.glyph).toBe(vw(34 * 0.76));
    expect(geo.badge).toBe(vw(22));
    expect(geo.badgeOff).toBe(vw(4));
    expect(geo.numberSize).toBe(vw(34));
    expect(geo.nameSize).toBe(vw(23));
    expect(geo.nameLine).toBe(vw(23) * 1.2);
    expect(geo.cellTop).toBe(vw(6));
    expect(geo.cellInset).toBe(vw(12));
    expect(geo.liveBarX).toBe(vw(3));
    expect(geo.liveBarInset).toBe(vw(10));
    expect(geo.padTop).toBe(vw(20));
    expect(geo.padX).toBe(vw(20));
    expect(geo.titleSize).toBe(vw(34));
    expect(geo.subSize).toBe(vw(26));
    expect(geo.subGap).toBe(vw(12));
  });

  test("widths and radii go through the scaler AuroraGrid applies to them", () => {
    expect(geo.cellRadius).toBe(4); // cs(8)
    expect(geo.cellBorder).toBe(0.5); // line(1)
    expect(geo.cellRing).toBe(1); // line(2)
    expect(geo.circleBorder).toBe(0.5); // line(1)
    expect(geo.circleRing).toBe(1); // line(2): the ring token
    expect(geo.liveBarW).toBe(1.5); // line(3)
    expect(geo.liveBarR).toBe(2); // line(4)
  });

  test("follows the tokens it is given", () => {
    const geo2 = auroraGeo(input, scalers, { ...AURORA, ringW: 4, cellBorderW: 2, cellRadius: 12, liveBar: { w: 5, r: 6 } });
    expect([geo2.cellRing, geo2.circleRing, geo2.cellBorder, geo2.cellRadius, geo2.liveBarW, geo2.liveBarR]).toEqual([2, 2, 1, 6, 2.5, 3]);
  });

  test("is JSON the native side can parse back unchanged", () => {
    expect(JSON.parse(JSON.stringify(geo))).toEqual(geo);
  });
});

describe("rowTokens", () => {
  test("are Aurora's colors, alphas and weights", () => {
    expect(rowTokens(AURORA)).toEqual({
      rowBorder: "rgba(148,163,184,0.12)",
      cellBg: "rgba(148,163,184,0.05)",
      liveCellBg: "transparent",
      cellBorder: "rgba(148,163,184,0.10)",
      ring: "#3b82f6",
      liveFill: { elapsed: 0.32, remain: 0.1 },
      title: "#f1f5f9",
      titleWeight: "600",
      sub: "#94a3b8",
      railFocusAlpha: 0.12,
      circle: { fillA: 0.2, borderA: 0.35 },
      heartOff: "#c3c9d4",
      fav: "#fb7185",
      number: "#94a3b8",
      numberFocused: "#e6eaf1",
      numberWeight: "700",
      name: "#94a3b8",
      artScrim: ["rgba(6,10,20,0.88)", "rgba(6,10,20,0.8)"],
      artTitle: "#f1f5f9",
      artSub: "#e6ebf2",
    });
  });

  test("only what the painter draws with: nothing from the featured panel, sidebar or time header", () => {
    const keys = Object.keys(rowTokens(AURORA));
    for (const other of ["bg", "scrim", "now", "featured", "badge", "sidebar", "glass", "ghost", "headerDay", "headerTick"]) expect(keys).not.toContain(other);
  });
});

describe("aurora-fixture.json", () => {
  test("is what the generator builds now (run packages/native-guide/scripts/gen-geometry-fixture.ts after changing the geometry or tokens)", () => {
    const { about, ...rest } = fixture;
    expect(about.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(buildAuroraFixture()))).toEqual(rest);
  });
});
