// Regenerates the fixtures the Kotlin JVM tests read from the guide's TypeScript:
//   bun packages/native-guide/scripts/gen-geometry-fixture.ts
//  - android/src/test/resources/geometry-fixture.json: the cell, live-fill and artwork-box geometry. The Kotlin geometry's
//    tests must reproduce every `out` and `kept`, and apps/tv-native's geometry.test.ts checks the TypeScript still does, so the two
//    renderers can't drift.
//  - android/src/test/resources/aurora-fixture.json: the `geo` and `tokens` JSON the Aurora rows send the native view, built
//    by the real functions, so the Kotlin tests can check the painter reads every field JS sends (and JS sends every field
//    the painter reads). apps/tv-native's native-rows-geo.test.ts checks the file is current.
// Seeded, so a rerun only changes a file when what it is generated from does.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { artBox, cellBox, isVisible, liveFill, MIN, WINDOW_MIN } from "../../../apps/tv-native/src/features/guide/geometry";
import { AURORA } from "../../../apps/tv-native/src/features/guide/guide-tokens";
import { auroraGeo, rowTokens, type Scalers } from "../../../apps/tv-native/src/features/guide/native-rows-geo";

const OUT = fileURLToPath(new URL("../android/src/test/resources/geometry-fixture.json", import.meta.url).href);
const AURORA_OUT = fileURLToPath(new URL("../android/src/test/resources/aurora-fixture.json", import.meta.url).href);

let seed = 20261026;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

type CellIn = { startMs: number; durationSeconds: number; originMs: number; ppm: number; laneW: number; gap: number };
const cellCase = (c: CellIn) => {
  const program = { startsAt: new Date(c.startMs).toISOString(), durationSeconds: c.durationSeconds };
  const lane = { T0: new Date(c.originMs), ppm: c.ppm, laneW: c.laneW, gap: c.gap };
  // `out` is where a Row places the cell (at `gap`); `kept` is whether the per-channel filter keeps the program (at its own gap).
  return { in: c, out: cellBox(program, lane), kept: isVisible(program, lane) };
};

export function buildFixture() {
  const cells = [];
  // Lanes as the guide builds them: laneW / WINDOW_MIN dp per minute. A gap of 3 is cs(6) on Android TV, 6 everywhere else.
  const lanes = [628.5, 700, 720, 796.4, 836, 1100] as const;
  const durations = [30, 60, 90, 120, 300, 900, 1320, 1800, 2700, 3600, 5400, 7200] as const;
  for (let i = 0; i < 90; i++) {
    const laneW = pick(lanes);
    const originMs = 1_760_000_000_000 + Math.floor(rnd() * 48) * 30 * MIN;
    const startMs = originMs + Math.round((rnd() * (WINDOW_MIN + 100) - 90) * 60) * 1000;
    cells.push(cellCase({ startMs, durationSeconds: pick(durations) + (rnd() < 0.2 ? 17 : 0), originMs, ppm: laneW / WINDOW_MIN, laneW, gap: pick([3, 6] as const) }));
  }
  // The boundaries: ends at the rail, starts at the window end, the 8 dp cut on a rail-clamped cell, the minimum width.
  const lane = { originMs: 1_760_000_000_000, ppm: 4, laneW: 720 };
  const edge = (startMin: number, durationSeconds: number, gap: number) => cells.push(cellCase({ ...lane, startMs: lane.originMs + startMin * MIN, durationSeconds, gap }));
  for (const gap of [3, 6]) {
    edge(-60, 3600, gap); // ends exactly at the rail
    edge(-60, 3601, gap);
    edge(WINDOW_MIN, 1800, gap); // starts at the window's end
    edge(WINDOW_MIN - 0.5, 1800, gap);
    edge(60, 60, gap); // one minute: held up by the minimum width
    edge(60, 0, gap);
    for (let s = 780; s <= 960; s += 15) edge(-10, s, gap); // rail-clamped, straddling the 8 dp cut
  }

  const liveFills = [];
  for (const [nowX, left, width] of [[150, 100, 200], [200, 100, 200], [50, 100, 200], [100, 100, 200], [300, 100, 200], [900, 100, 200], [263.2, 263.2, 8.4], [0, 3, 10], [10.5, 3, 10], [1e-9, 0, 1e-9]] as const) {
    liveFills.push({ in: { nowX, left, width }, out: liveFill(nowX, left, width) });
  }

  const artBoxes = [];
  for (const [w, h, ratio, step] of [[100, 40, 2, 64], [32, 32, 2, 64], [128, 55, 2, 64], [200.5, 44, 2, 64], [123.456, 39.9, 1.5, 64], [100.1, 33.3, 2.625, 64], [4000, 4000, 2, 64], [0.2, 0.2, 2, 64], [0, 0, 1, 64], [40, 53, 2, 32], [86, 106, 1, 32]] as const) {
    artBoxes.push({ in: { w, h, ratio, step }, out: artBox(w, h, ratio, step) });
  }

  return { cells, liveFills, artBoxes };
}

/**
 * The Aurora rows' `geo` and `tokens` JSON for an Android TV screen: 960 dp wide at 2x density (a 1080p panel), where
 * CHROME_SCALE is 0.5. The three scalers repeat the formulas of features/guide/layout.ts (which can't be loaded outside
 * React Native): vw = px / 2560 * width, cs = px * CHROME_SCALE, line = cs snapped to a physical pixel, never below one.
 */
export function buildAuroraFixture() {
  const width = 960;
  const pixelRatio = 2;
  const chrome = Math.max(0.5, Math.min(1, width / 1920));
  const scalers: Scalers = {
    vw: (px) => (px / 2560) * width,
    cs: (px) => px * chrome,
    line: (px) => Math.max(1 / pixelRatio, Math.round(px * chrome * pixelRatio) / pixelRatio),
  };
  const colW = width - 92;
  const railPx = (colW * 212) / 2560;
  const laneW = colW - railPx;
  const originMs = 1_760_000_000_000;
  const geo = auroraGeo(
    { rowPx: (width * 168) / 2560, railPx, laneW, ppm: laneW / WINDOW_MIN, originMs, gap: scalers.cs(6), featureScale: 0.76 },
    scalers,
    AURORA,
  );
  return { geo, tokens: rowTokens(AURORA), density: pixelRatio, widthDp: width };
}

const about =
  "Generated from apps/tv-native/src/features/guide/geometry.ts by packages/native-guide/scripts/gen-geometry-fixture.ts. The Kotlin geometry must reproduce every `out` (a null `out` means no cell is drawn) and `kept` (whether the per-channel filter keeps the program); geometry.test.ts checks the TypeScript still does.";
const auroraAbout =
  "Generated from apps/tv-native/src/features/guide/native-rows-geo.ts by packages/native-guide/scripts/gen-geometry-fixture.ts: the `geo` and `tokens` JSON the Aurora rows send the native view, for a 960 dp wide screen at density 2. native-rows-geo.test.ts checks it is current.";

if (import.meta.main) {
  const sections = buildFixture();
  const body = Object.entries(sections)
    .map(([k, arr]) => `  ${JSON.stringify(k)}: [\n${arr.map((x) => `    ${JSON.stringify(x)}`).join(",\n")}\n  ]`)
    .join(",\n");
  writeFileSync(OUT, `{\n  "about": ${JSON.stringify(about)},\n${body}\n}\n`);
  console.log(`geometry-fixture.json: ${sections.cells.length} cells (${sections.cells.filter((c) => !c.out).length} culled), ${sections.liveFills.length} fills, ${sections.artBoxes.length} art boxes`);
  writeFileSync(AURORA_OUT, `${JSON.stringify({ about: auroraAbout, ...buildAuroraFixture() }, null, 2)}\n`);
  console.log("aurora-fixture.json written");
}
