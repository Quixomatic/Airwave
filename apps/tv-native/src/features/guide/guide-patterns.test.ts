/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { inflateSync } from "node:zlib";

import { encodePng, grainTile, memoLru, mulberry32, pngDataUri, toBase64 } from "./guide-patterns";
import { GUIDE_THEMES, resolveGuideTokens } from "./guide-themes";

const grain = { tile: 16, density: 0.3, alpha: 0.08, colors: ["#000000", "#ffffff"], seed: 23 };

describe("the seeded generator", () => {
  test("the same seed gives the same sequence, another seed another", () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(mulberry32(6)()).not.toBe(first[0]);
  });

  test("the sequence is pinned, so a tile never drifts from the one the native painter draws", () => {
    const r = mulberry32(11);
    expect([r(), r(), r()]).toEqual([0.5115870486479253, 0.5299464082345366, 0.6081185641232878]);
  });
});

describe("the grain tile", () => {
  test("it is the same tile for the same seed and lit about as often as asked", () => {
    const a = grainTile(grain);
    expect(a.width).toBe(16);
    expect(a.rgba).toHaveLength(16 * 16 * 4);
    expect(Array.from(grainTile(grain).rgba)).toEqual(Array.from(a.rgba));
    const big = grainTile({ ...grain, tile: 128, density: 0.2 });
    let lit = 0;
    for (let i = 3; i < big.rgba.length; i += 4) if (big.rgba[i]! > 0) lit++;
    expect(lit / (128 * 128)).toBeGreaterThan(0.18);
    expect(lit / (128 * 128)).toBeLessThan(0.22);
  });

  test("a speck is one of the colors, at between 45 and 100 per cent of the grain's alpha", () => {
    const t = grainTile({ ...grain, colors: ["#ff0000"], alpha: 0.5, tile: 64 });
    for (let i = 0; i < t.rgba.length; i += 4) {
      if (t.rgba[i + 3] === 0) continue;
      expect([t.rgba[i], t.rgba[i + 1], t.rgba[i + 2]]).toEqual([255, 0, 0]);
      expect(t.rgba[i + 3]).toBeGreaterThanOrEqual(Math.floor(255 * 0.5 * 0.45));
      expect(t.rgba[i + 3]).toBeLessThanOrEqual(Math.ceil(255 * 0.5));
    }
  });

  test("a scale repeats each texel into a block of pixels, so the tile can be made at screen resolution", () => {
    const one = grainTile(grain);
    const two = grainTile(grain, 2);
    expect(two.width).toBe(32);
    const px = (t: typeof one, x: number, y: number) => Array.from(t.rgba.subarray((y * t.width + x) * 4, (y * t.width + x) * 4 + 4));
    for (const [x, y] of [[0, 0], [3, 5], [15, 15]] as const) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) expect(px(two, x * 2 + dx, y * 2 + dy)).toEqual(px(one, x, y));
    }
    // a fractional scale rounds the size and still covers every texel
    expect(grainTile(grain, 1.5).width).toBe(24);
  });

  test("every grain a theme uses makes a tile", () => {
    for (const t of GUIDE_THEMES) {
      for (const v of t.variants) {
        const g = resolveGuideTokens(t.id, v.id).patterns.overlay;
        if (g) expect(grainTile(g, 1.5).width).toBe(Math.round(g.tile * 1.5));
      }
    }
  });
});

describe("the PNG", () => {
  const tile = grainTile(grain);
  const png = encodePng(tile);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);

  test("it has the PNG signature and a header that says what the tile is", () => {
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe("IHDR");
    expect(view.getUint32(16)).toBe(16);
    expect(view.getUint32(20)).toBe(16);
    expect([png[24], png[25]]).toEqual([8, 6]); // 8 bit RGBA
  });

  test("every chunk's checksum is right", () => {
    let o = 8;
    const types: string[] = [];
    while (o < png.length) {
      const len = view.getUint32(o);
      types.push(String.fromCharCode(...png.subarray(o + 4, o + 8)));
      const crc = view.getUint32(o + 8 + len);
      expect(crc).toBe(Bun.hash.crc32(png.subarray(o + 4, o + 8 + len)));
      o += 12 + len;
    }
    expect(types).toEqual(["IHDR", "IDAT", "IEND"]);
  });

  test("a decoder gets the pixels back (each row is one filter byte, 0, and the row)", () => {
    const idatLen = view.getUint32(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    expect(raw).toHaveLength(16 * (16 * 4 + 1));
    for (let y = 0; y < 16; y++) {
      expect(raw[y * 65]).toBe(0);
      expect(Array.from(raw.subarray(y * 65 + 1, y * 65 + 65))).toEqual(Array.from(tile.rgba.subarray(y * 64, y * 64 + 64)));
    }
  });

  test("a tile over 64 KB spans several stored blocks and still decodes", () => {
    const big = grainTile({ ...grain, tile: 200 });
    const out = encodePng(big);
    const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const raw = inflateSync(out.subarray(41, 41 + v.getUint32(33)));
    expect(raw).toHaveLength(200 * (200 * 4 + 1));
  });
});

describe("base64 and the data address", () => {
  test("it matches the standard encoding at every padding length", () => {
    for (let n = 0; n < 10; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);
      expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });

  test("the address is a PNG data URI", () => {
    const uri = pngDataUri(grainTile(grain));
    expect(uri.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(uri.slice(22), "base64").subarray(1, 4).toString()).toBe("PNG");
  });
});

describe("memoLru", () => {
  test("it makes an entry once and hands the same one back", () => {
    const cache = new Map<string, number>();
    let made = 0;
    const get = (k: string) => memoLru(cache, k, 3, () => ++made);
    expect(get("a")).toBe(1);
    expect(get("a")).toBe(1);
    expect(made).toBe(1);
  });

  test("it keeps only the most recently asked-for entries, so a long walk over many looks holds a bounded few", () => {
    const cache = new Map<string, number>();
    for (let i = 0; i < 100; i++) {
      memoLru(cache, `look${i}`, 3, () => i);
      expect(cache.size).toBeLessThanOrEqual(3);
    }
    expect([...cache.keys()]).toEqual(["look97", "look98", "look99"]);
  });

  test("asking for an entry again makes it the newest, so it is the last to go", () => {
    const cache = new Map<string, number>();
    let made = 0;
    const get = (k: string) => memoLru(cache, k, 2, () => ++made);
    get("a");
    get("b");
    get("a"); // a is newest
    get("c"); // evicts b
    expect([...cache.keys()]).toEqual(["a", "c"]);
    expect(get("a")).toBe(1);
  });

  test("a bound under one still keeps the entry just made", () => {
    const cache = new Map<string, number>();
    expect(memoLru(cache, "a", 0, () => 7)).toBe(7);
    expect(cache.size).toBe(1);
  });
});

describe("the grain's pixels are pinned", () => {
  // The grain tile is made on the JS thread for every pixel of its scaled size and base64'd, so it has been made cheaper; these are the length and an FNV-1a hash of the
  // data address of the tile each theme's grain made at three scales BEFORE that, so a faster tile is the same tile (a theme's grain must look as it did).
  const fnv = (s: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  const PINS: [Parameters<typeof grainTile>[0], number, number, string][] = [
    [{"tile": 128, "density": 0.2, "alpha": 0.075, "colors": ["#5a4a2a"], "seed": 11}, 1, 87674, "346da3dd"], // risograph/flamingo
    [{"tile": 128, "density": 0.2, "alpha": 0.075, "colors": ["#5a4a2a"], "seed": 11}, 1.5, 196990, "7f2c6a25"], // risograph/flamingo
    [{"tile": 128, "density": 0.2, "alpha": 0.075, "colors": ["#5a4a2a"], "seed": 11}, 2.25, 442898, "2572aca2"], // risograph/flamingo
    [{"tile": 128, "density": 0.2, "alpha": 0.075, "colors": ["#3d4a2a"], "seed": 11}, 1, 87674, "4e185fb6"], // risograph/tidepool
    [{"tile": 128, "density": 0.2, "alpha": 0.075, "colors": ["#3d4a2a"], "seed": 11}, 1.5, 196990, "1a89dadf"], // risograph/tidepool
    [{"tile": 128, "density": 0.2, "alpha": 0.075, "colors": ["#3d4a2a"], "seed": 11}, 2.25, 442898, "53f0ec78"], // risograph/tidepool
    [{"tile": 128, "density": 0.3, "alpha": 0.08, "colors": ["#000000", "#ffffff"], "seed": 23}, 1, 87674, "21228303"], // neo-brutalist/acid
    [{"tile": 128, "density": 0.3, "alpha": 0.08, "colors": ["#000000", "#ffffff"], "seed": 23}, 1.5, 196990, "a5db949b"], // neo-brutalist/acid
    [{"tile": 128, "density": 0.3, "alpha": 0.08, "colors": ["#000000", "#ffffff"], "seed": 23}, 2.25, 442898, "aafc73dd"], // neo-brutalist/acid
    [{"tile": 128, "density": 0.2, "alpha": 0.04, "colors": ["#4a3d22"], "seed": 5}, 1, 87674, "7fd2c975"], // editorial/newsprint
    [{"tile": 128, "density": 0.2, "alpha": 0.04, "colors": ["#4a3d22"], "seed": 5}, 1.5, 196990, "ded0ac7a"], // editorial/newsprint
    [{"tile": 128, "density": 0.2, "alpha": 0.04, "colors": ["#4a3d22"], "seed": 5}, 2.25, 442898, "47da3200"], // editorial/newsprint
    [{"tile": 128, "density": 0.2, "alpha": 0.035, "colors": ["#d8c9a8"], "seed": 5}, 1, 87674, "a165a635"], // editorial/evening
    [{"tile": 128, "density": 0.2, "alpha": 0.035, "colors": ["#d8c9a8"], "seed": 5}, 1.5, 196990, "d47cd262"], // editorial/evening
    [{"tile": 128, "density": 0.2, "alpha": 0.035, "colors": ["#d8c9a8"], "seed": 5}, 2.25, 442898, "255a1a75"], // editorial/evening
    [{"tile": 128, "density": 0.2, "alpha": 0.04, "colors": ["#6a4630"], "seed": 5}, 1, 87674, "1c7123d6"], // editorial/salmon
    [{"tile": 128, "density": 0.2, "alpha": 0.04, "colors": ["#6a4630"], "seed": 5}, 1.5, 196990, "b3e9d5a8"], // editorial/salmon
    [{"tile": 128, "density": 0.2, "alpha": 0.04, "colors": ["#6a4630"], "seed": 5}, 2.25, 442898, "6765de3f"], // editorial/salmon
  ];

  test("every tile is byte for byte the one it was", () => {
    expect(PINS.length).toBeGreaterThanOrEqual(18);
    for (const [g, scale, length, hash] of PINS) {
      const uri = pngDataUri(grainTile(g, scale));
      expect(uri.length, `${g.seed} ${g.colors} x${scale}`).toBe(length);
      expect(fnv(uri), `${g.seed} ${g.colors} x${scale}`).toBe(hash);
    }
  });

  test("the pins cover every grain a theme has", () => {
    const pinned = new Set(PINS.map(([g]) => `${g.tile}|${g.density}|${g.alpha}|${g.colors.join(",")}|${g.seed}`));
    for (const t of GUIDE_THEMES) {
      for (const v of t.variants) {
        const g = resolveGuideTokens(t.id, v.id).patterns.overlay;
        if (g) expect(pinned.has(`${g.tile}|${g.density}|${g.alpha}|${g.colors.join(",")}|${g.seed}`), `${t.id}/${v.id}`).toBe(true);
      }
    }
  });

  test("a scaled tile is the same texel in every pixel of its block, at any scale, and base64 is the engine's own", () => {
    const g = { tile: 20, density: 0.3, alpha: 0.5, colors: ["#336699", "#ffffff"], seed: 3 };
    for (const scale of [1.5, 2.25, 3]) {
      const t = grainTile(g, scale);
      const base = grainTile(g);
      for (let y = 0; y < t.height; y++) {
        for (let x = 0; x < t.width; x++) {
          const sx = Math.min(g.tile - 1, Math.floor(x / scale));
          const sy = Math.min(g.tile - 1, Math.floor(y / scale));
          expect(Array.from(t.rgba.subarray((y * t.width + x) * 4, (y * t.width + x) * 4 + 4))).toEqual(Array.from(base.rgba.subarray((sy * g.tile + sx) * 4, (sy * g.tile + sx) * 4 + 4)));
        }
      }
    }
    const bytes = encodePng(grainTile(g, 2));
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    for (const n of [0, 1, 2, 3, 4, 4095, 4096, 4097, 20000]) {
      const b = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
      expect(toBase64(b), `${n} bytes`).toBe(Buffer.from(b).toString("base64"));
    }
  });
});
