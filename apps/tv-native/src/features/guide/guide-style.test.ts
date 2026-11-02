/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FIXED_WEIGHTS, FONT_FACES } from "./guide-fonts";
import {
  burstPoints,
  cellShadow,
  cellSurface,
  cellTextColors,
  circleColors,
  dimensionTicks,
  faceText,
  featuredGround,
  featuredProgress,
  fixedWeight,
  gradientPoints,
  labelFits,
  lineWasCut,
  misBlend,
  misPaper,
  misShift,
  plainInk,
  railBackground,
  ringLayers,
  roleText,
  rulerTicks,
  shadowInset,
  themeFramesCells,
  tickPath,
  verticalsPath,
} from "./guide-style";
import { GUIDE_THEMES, resolveGuideTokens } from "./guide-themes";
import { AURORA, type GuideTextRole, onGround, railGround } from "./guide-tokens";

const ROLES: GuideTextRole[] = ["title", "sub", "number", "name", "header", "day", "featured"];
const WEIGHT = { title: "600", sub: undefined, number: "700", name: undefined, header: "600", day: "600", featured: "700" } as const;

// What the converted pieces use to scale a theme's sizes: a 960 dp TV, where a design px is 0.375 dp and a `line()` unit 0.5 dp.
const s = { vw: (px: number) => px * 0.375, ln: (px: number) => (px > 0 ? px * 0.5 : 0) };

describe("text styles", () => {
  test("Aurora's roles are the system font at their size and weight and nothing else", () => {
    for (const role of ROLES) {
      const style = roleText(AURORA, role, 20);
      expect(style).toEqual(WEIGHT[role] ? { fontSize: 20, fontWeight: WEIGHT[role] } : { fontSize: 20 });
    }
  });

  test("a theme's face adds its family, weight, tracking, case and slant, and drops the font's padding", () => {
    const pop = resolveGuideTokens("pop-art", "sunny");
    expect(roleText(pop, "title", 10)).toEqual({ fontSize: 12.2, fontFamily: "Bangers", includeFontPadding: false, letterSpacing: 0.03 * 12.2, textTransform: "uppercase" });
    // the sub-line is in the text face at its own weight
    expect(roleText(pop, "sub", 10)).toEqual({ fontSize: 10, fontFamily: "Comic Neue", fontWeight: "700", includeFontPadding: false });
    const editorial = resolveGuideTokens("editorial", "newsprint");
    expect(roleText(editorial, "header", 10)).toEqual({ fontSize: 10, fontFamily: "Fraunces", fontWeight: "600", fontStyle: "italic", includeFontPadding: false });
  });

  test("fontScale and a role's scale multiply the size", () => {
    const hc = resolveGuideTokens("high-contrast", "signal");
    expect(roleText(hc, "number", 10).fontSize).toBeCloseTo(10 * 1.1 * 1.12, 10);
    expect(roleText(hc, "day", 10).fontSize).toBeCloseTo(10 * 0.7 * 1.12, 10);
  });

  test("a free face takes the weight, tracking and case it is asked for", () => {
    expect(faceText(AURORA, "text", 8)).toEqual({ fontSize: 8 });
    expect(faceText(resolveGuideTokens("editorial", "newsprint"), "text", 8, { weight: "700", track: 0.14, upper: true })).toEqual({
      fontSize: 8,
      fontFamily: "Source Sans 3",
      fontWeight: "700",
      includeFontPadding: false,
      letterSpacing: 0.14 * 8,
      textTransform: "uppercase",
    });
  });

  test("every role of every variant has a positive size", () => {
    for (const t of GUIDE_THEMES) {
      for (const v of t.variants) {
        const tk = resolveGuideTokens(t.id, v.id);
        for (const role of ROLES) expect(roleText(tk, role, 20).fontSize).toBeGreaterThan(0);
      }
    }
  });
});

describe("cell colors and surface", () => {
  test("art under the whole cell wins, then the selected cell's, then the on-now cell's", () => {
    const tk = { ...AURORA, focusText: { title: "#111111", sub: "#222222", kicker: "#333333" }, liveText: { title: "#444444", sub: "#555555" } };
    expect(cellTextColors(tk, { selected: true, live: true, artFull: true })).toEqual({ title: tk.artTitle, sub: tk.artSub });
    expect(cellTextColors(tk, { selected: true, live: true, artFull: false })).toEqual({ title: "#111111", sub: "#222222" });
    expect(cellTextColors(tk, { selected: false, live: true, artFull: false })).toEqual({ title: "#444444", sub: "#555555" });
    expect(cellTextColors(tk, { selected: false, live: false, artFull: false })).toEqual({ title: tk.title, sub: tk.sub });
    expect(cellTextColors(AURORA, { selected: true, live: true, artFull: false })).toEqual({ title: AURORA.title, sub: AURORA.sub });
  });

  test("Aurora's surface is its cell fill and hairline, and the ring when selected", () => {
    expect(cellSurface(AURORA, { selected: false, live: false })).toEqual({ bg: AURORA.cellBg, borderW: 1, borderColor: AURORA.cellBorder, dashed: false });
    expect(cellSurface(AURORA, { selected: false, live: true }).bg).toBe(AURORA.liveCellBg);
    expect(cellSurface(AURORA, { selected: true, live: false })).toMatchObject({ borderW: 2, borderColor: AURORA.ring });
  });

  test("a focus fill replaces the cell's own; only a cell that is neither live nor selected is dashed", () => {
    const bp = resolveGuideTokens("blueprint", "cyanotype");
    expect(cellSurface(bp, { selected: true, live: true }).bg).toBe(bp.cellFocusBg!);
    expect(cellSurface(bp, { selected: false, live: false }).dashed).toBe(true);
    expect(cellSurface(bp, { selected: false, live: true }).dashed).toBe(false);
    expect(cellSurface(bp, { selected: true, live: false }).dashed).toBe(false);
  });
});

describe("shadows and rings", () => {
  test("the selected cell takes its own shadow, else the resting one", () => {
    const pop = resolveGuideTokens("pop-art", "sunny");
    expect(cellShadow(pop, false)).toBe(pop.shadow);
    expect(cellShadow(pop, true)).toBe(pop.shadowFocus);
    const hc = resolveGuideTokens("high-contrast", "signal");
    expect(cellShadow(hc, true)).toBeNull();
    expect(cellShadow({ ...pop, shadowFocus: null }, true)).toBe(pop.shadow);
  });

  test("a hard shadow shrinks the body by its largest offset and an outer one does not", () => {
    const pop = resolveGuideTokens("pop-art", "sunny");
    expect(shadowInset(pop.shadow)).toEqual({ dx: 4, dy: 4 });
    expect(shadowInset(pop.shadowFocus)).toEqual({ dx: 12, dy: 12 });
    expect(shadowInset(resolveGuideTokens("modern", "dark").shadow)).toEqual({ dx: 0, dy: 0 });
    expect(shadowInset(null)).toEqual({ dx: 0, dy: 0 });
  });

  test("the double ring starts after its gap, and the halo's strokes start where it stops", () => {
    const hc = resolveGuideTokens("high-contrast", "signal");
    // gap 3 design px = 1.125 dp, then a stroke of 2.25 line units = 1.125 dp
    const [outer] = ringLayers(hc, "#ffffff", s);
    expect(outer).toEqual({ out: 1.125 + 1.125, w: 1.125, color: "#ffffff", dashed: false });
    const modern = resolveGuideTokens("modern", "dark");
    const rings = ringLayers(modern, "#2f9e8f", s);
    expect(rings.map((r) => r.w)).toEqual([3 * 0.375, 3 * 0.375]);
    expect(rings.map((r) => r.out)).toEqual([3 * 0.375, 6 * 0.375]);
    expect(rings[0]!.color).toBe("rgba(47, 158, 143, 0.8)");
    expect(rings[1]!.color).toBe("rgba(47, 158, 143, 0.4)");
  });

  test("a dashed double ring is dashed, and Aurora has no rings", () => {
    expect(ringLayers(resolveGuideTokens("blueprint", "cyanotype"), "#eef6ff", s)[0]!.dashed).toBe(true);
    expect(ringLayers(AURORA, "#2f9e8f", s)).toEqual([]);
  });
});

describe("shapes", () => {
  test("the burst is a 24 point star that starts at the top and alternates its radius", () => {
    const pts = burstPoints();
    expect(pts).toHaveLength(24);
    expect(pts[0]![0]).toBeCloseTo(50, 10);
    expect(pts[0]![1]).toBeCloseTo(0, 10);
    expect(pts[1]![1]).toBeGreaterThan(pts[0]![1]);
    const dist = pts.map(([x, y]) => Math.hypot(x - 50, y - 50));
    dist.forEach((d, k) => expect(d).toBeCloseTo(k % 2 === 0 ? 50 : 38, 10));
  });

  test("a CSS angle runs corner to corner on a square and edge to edge at 90 degrees", () => {
    const a = gradientPoints(135, 100, 100);
    expect(a.start.x).toBeCloseTo(0, 10);
    expect(a.start.y).toBeCloseTo(0, 10);
    expect(a.end.x).toBeCloseTo(1, 10);
    expect(a.end.y).toBeCloseTo(1, 10);
    const b = gradientPoints(90, 200, 50);
    expect(b.start.x).toBeCloseTo(0, 10);
    expect(b.start.y).toBeCloseTo(0.5, 10);
    expect(b.end.x).toBeCloseTo(1, 10);
    expect(b.end.y).toBeCloseTo(0.5, 10);
  });

  test("the burst and the plate drop out of a cell that is too narrow", () => {
    const sl = { mode: "plate" as const, text: "NOW", bg: "#fff", fg: "#000", minCell: 420 };
    expect(labelFits(sl, 419)).toBe(false);
    expect(labelFits(sl, 420)).toBe(true);
  });
});

describe("a kicker line that had to be cut", () => {
  test("is told by the ellipsis Android writes into the line it laid out, or by a second line", () => {
    expect(lineWasCut([{ text: "9:01 PM" }])).toBe(false);
    expect(lineWasCut([{ text: "ON NOW" }])).toBe(false);
    expect(lineWasCut([{ text: "9\u2026\uFEFF\uFEFF\uFEFF\uFEFF\uFEFF" }])).toBe(true);
    expect(lineWasCut([{ text: "\u2026" }])).toBe(true);
    expect(lineWasCut([{ text: "9:01" }, { text: "PM" }])).toBe(true);
    expect(lineWasCut([])).toBe(false);
  });
});

describe("ticks", () => {
  test("a dimension line's ticks keep the minute they were drawn for when the cell is clamped", () => {
    // ticks every 10 dp, majors every 3: the programme started 25 dp left of the visible edge
    const ticks = dimensionTicks(60, 10, 25, 3);
    expect(ticks.map((t) => t.x)).toEqual([5, 15, 25, 35, 45, 55]);
    // k counts from the programme's start: ticks at -25 (k 0), -15, -5, 5 (k 3, major), 15, 25, 35 (k 6, major) ...
    expect(ticks.map((t) => t.major)).toEqual([true, false, false, true, false, false]);
  });

  test("an unclamped line starts with a major tick at 0, and a zero step gives none", () => {
    expect(dimensionTicks(20, 10, 0, 2)).toEqual([
      { x: 0, major: true },
      { x: 10, major: false },
      { x: 20, major: true },
    ]);
    expect(dimensionTicks(20, 0, 0, 2)).toEqual([]);
  });

  test("the header's ruler has a tick every 5 minutes and a taller one every 30", () => {
    const ticks = rulerTicks(180, 2, 5, 30);
    expect(ticks).toHaveLength(37);
    expect(ticks[0]).toEqual({ x: 0, major: true });
    expect(ticks[1]).toEqual({ x: 10, major: false });
    expect(ticks.filter((t) => t.major)).toHaveLength(7);
  });
});

describe("circle and rail", () => {
  const under = "#101010";
  test("Aurora's circle is the row's accent as a tint, its mark as the rim and the glyph", () => {
    expect(circleColors(AURORA, { accent: "#2f9e8f", fg: "#2f9e8f", rowFocused: false, featured: false, under })).toEqual({
      fill: "rgba(47, 158, 143, 0.2)",
      border: "rgba(47, 158, 143, 0.35)",
      glyph: "#2f9e8f",
    });
  });

  test("a solid accent fill with automatic ink is black or white, whichever reads better on it", () => {
    const pop = resolveGuideTokens("pop-art", "sunny");
    expect(circleColors(pop, { accent: "#ffd91a", fg: "#ffd91a", rowFocused: false, featured: false, under }).glyph).toBe("#000000");
    expect(circleColors(pop, { accent: "#1f4fd8", fg: "#1f4fd8", rowFocused: false, featured: false, under }).glyph).toBe("#ffffff");
  });

  test("the featured tile's ground is its plate over the guide's ground, else the ground: not the rail's", () => {
    expect(featuredGround(AURORA)).toBe(onGround(AURORA, AURORA.bg));
    const bp = resolveGuideTokens("blueprint", "cyanotype");
    expect(bp.featuredPlate).not.toBeNull();
    expect(featuredGround(bp)).toBe(onGround(bp, bp.featuredPlate!.bg));
    expect(featuredGround(resolveGuideTokens("pop-art", "sunny"))).toBe("#ffffff");
    for (const t of GUIDE_THEMES) for (const v of t.variants) expect(featuredGround(resolveGuideTokens(t.id, v.id)), `${t.id}/${v.id}`).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("an automatic glyph under a clear fill takes its ink from the ground it is on", () => {
    // A dark rail beside a light plate: the same translucent circle reads against one and the other differently.
    const tk = {
      ...AURORA,
      bg: "#101010",
      railBg: "#101010",
      featuredPlate: { bg: "#ffffff", border: { w: 0, color: "#000000" }, radius: 0, shadow: null },
      circleStyle: { ...AURORA.circleStyle, fill: "rgba(128, 128, 128, 0.2)", glyph: "auto" as const },
    };
    const o = { accent: "#2f9e8f", fg: "#2f9e8f", rowFocused: false };
    expect(circleColors(tk, { ...o, featured: false, under: railGround(tk) }).glyph).toBe("#ffffff"); // on the dark rail
    expect(circleColors(tk, { ...o, featured: true, under: featuredGround(tk) }).glyph).toBe("#000000"); // on the light plate
  });

  test("a focused rail recolors the circle and its glyph, except on the featured tile and where the theme keeps them", () => {
    const hc = resolveGuideTokens("high-contrast", "signal");
    const focused = circleColors(hc, { accent: "#fff", fg: "#fff", rowFocused: true, featured: false, under });
    expect(focused).toMatchObject({ fill: hc.railFocus!.circle, glyph: hc.railFocus!.glyph });
    expect(circleColors(hc, { accent: "#fff", fg: "#fff", rowFocused: true, featured: true, under })).toMatchObject({ fill: hc.circleStyle.fill, glyph: hc.circleStyle.glyph });
    const bp = resolveGuideTokens("blueprint", "cyanotype");
    expect(circleColors(bp, { accent: "#eef6ff", fg: "#eef6ff", rowFocused: true, featured: false, under })).toMatchObject({ fill: "transparent", glyph: bp.circleStyle.glyph });
  });

  test("a focused rail is the theme's solid color, else the accent wash over the rail's own fill", () => {
    expect(railBackground(AURORA, "#2f9e8f", false)).toBe("transparent");
    expect(railBackground(AURORA, "#2f9e8f", true)).toBe("rgba(47, 158, 143, 0.12)");
    const hc = resolveGuideTokens("high-contrast", "signal");
    expect(railBackground(hc, "#ffffff", true)).toBe(hc.railFocus!.bg);
    const editorial = resolveGuideTokens("editorial", "newsprint");
    expect(railBackground(editorial, "#b50d27", false)).toBe("transparent");
    const washed = { ...editorial, railBg: "#ffffff" };
    expect(railBackground(washed, "#000000", true)).toBe("rgba(230, 230, 230, 1)");
  });
});

describe("featured progress", () => {
  test("with no theme progress it is Aurora's thin rounded bar in the accent", () => {
    expect(featuredProgress(AURORA, "#2f9e8f")).toEqual({ kind: "bar", h: null, r: null, border: null, track: AURORA.featured.track, fill: "#2f9e8f" });
  });

  test("a band is the theme's own bar, a ticks style a dimension line", () => {
    const pop = resolveGuideTokens("pop-art", "sunny");
    expect(featuredProgress(pop, "#e0161e")).toMatchObject({ kind: "bar", h: 18 * 0.75, r: 0, track: "#ffffff", fill: "#e0161e", border: pop.progress.trackBorder });
    const bp = resolveGuideTokens("blueprint", "cyanotype");
    expect(featuredProgress(bp, "#eef6ff")).toMatchObject({ kind: "ticks", h: 26 });
    // a transparent track falls back to the panel's own
    expect(featuredProgress(bp, "#eef6ff")).toHaveProperty("ticks");
    const swiss = resolveGuideTokens("swiss-poster", "vermilion");
    expect(featuredProgress({ ...swiss, progress: { ...swiss.progress, track: "transparent" } }, "#d9001b")).toMatchObject({ track: swiss.featured.track });
  });
});

describe("misregistered ink", () => {
  test("the second ink is moved by the theme's offset, in dp", () => {
    const pop = { dx: 3.5, dy: 2.5 };
    expect(misShift(pop, s.vw)).toEqual({ transform: [{ translateX: 1.3125 }, { translateY: 0.9375 }] });
    expect(misShift({ dx: -4, dy: 0 }, s.vw)).toEqual({ transform: [{ translateX: -1.5 }, { translateY: 0 }] });
  });

  test("the paper reaches a pixel past the line and as far as the second ink is moved", () => {
    expect(misPaper({ dx: 4, dy: 2.4 }, (px) => px * 0.5)).toEqual({ left: -1, top: -1, right: -3, bottom: -2.2 });
    expect(misPaper({ dx: -4, dy: 0 }, (px) => px * 0.5)).toEqual({ left: -3, top: -1, right: -1, bottom: -1 });
  });

  test("everything is blended except the now marker's copy, which would put the rows' whole container in a layer", () => {
    expect(misBlend("marker")).toBeUndefined();
    for (const part of ["back-text", "front-text", "ring", "rim"] as const) expect(misBlend(part)).toBe("multiply");
  });
});

describe("tick paths", () => {
  test("every tick is one stroke from the base up by its own height, in one path", () => {
    const ticks = [
      { x: 0, major: true },
      { x: 10.5, major: false },
      { x: 21, major: false },
    ];
    expect(tickPath(ticks, 30, (major) => (major ? 15 : 8))).toBe("M0 30L0 15 M10.5 30L10.5 22 M21 30L21 22");
  });

  test("a path of no ticks is empty, and coordinates keep three decimals", () => {
    expect(tickPath([], 30, () => 8)).toBe("");
    expect(tickPath([{ x: 1 / 3, major: false }], 10 / 3, () => 1 / 3)).toBe("M0.333 3.333L0.333 3");
  });

  test("it draws the same ticks the lines did, one for one", () => {
    const ticks = dimensionTicks(400, 17.3, 0, 3);
    const d = tickPath(ticks, 40, (major) => (major ? 14 : 7));
    expect(d.split("M").length - 1).toBe(ticks.length);
    for (const t of ticks) expect(d).toContain(`M${Math.round(t.x * 1000) / 1000} 40L${Math.round(t.x * 1000) / 1000} ${t.major ? 26 : 33}`);
  });

  test("the end caps are two verticals", () => {
    expect(verticalsPath([2, 398], 10, 30)).toBe("M2 10L2 30 M398 10L398 30");
  });
});

describe("plain ink for a thumbnail", () => {
  test("a misregistered theme's inks are drawn without blending, and nothing else changes", () => {
    const riso = resolveGuideTokens("risograph", "flamingo");
    const plain = plainInk(riso);
    expect(riso.misregister?.blend).toBe("multiply");
    expect(plain.misregister?.blend).toBe("plain");
    expect({ ...plain, misregister: riso.misregister }).toEqual(riso);
    expect(misBlend("front-text", plain.misregister!.blend)).toBeUndefined();
    expect(misBlend("ring", plain.misregister!.blend)).toBeUndefined();
    expect(misBlend("rim", plain.misregister!.blend)).toBeUndefined();
  });

  test("a theme without misregistration is returned as it is", () => {
    for (const t of GUIDE_THEMES) {
      const tk = resolveGuideTokens(t.id, t.defaultVariant);
      if (!tk.misregister) expect(plainInk(tk)).toBe(tk);
    }
  });

  test("the chosen tokens are untouched (they are the cached ones)", () => {
    const riso = resolveGuideTokens("risograph", "flamingo");
    plainInk(riso);
    expect(riso.misregister?.blend).toBe("multiply");
  });
});

describe("weights the guide sets text in on its own", () => {
  test("a weight a bundled family lacks is the family's nearest one, on purpose", () => {
    const pop = resolveGuideTokens("pop-art", "sunny"); // Bangers (display) and Comic Neue (text)
    expect(faceText(pop, "display", 10, { weight: "800" })).toEqual({ fontSize: 10, fontFamily: "Bangers", includeFontPadding: false }); // Bangers has 400 only: 400 is left out
    expect(faceText(pop, "text", 10, { weight: "500" })).toEqual({ fontSize: 10, fontFamily: "Comic Neue", includeFontPadding: false }); // no 500: 400
    expect(faceText(pop, "text", 10, { weight: "700" }).fontWeight).toBe("700");
    // the system font keeps whatever is asked
    expect(faceText(AURORA, "display", 10, { weight: "800" })).toEqual({ fontSize: 10, fontWeight: "800" });
  });

  test("whatever any theme's faces are, a weight set on its own is one they have", () => {
    for (const t of GUIDE_THEMES) {
      for (const v of t.variants) {
        const tk = resolveGuideTokens(t.id, v.id);
        for (const use of Object.keys(FIXED_WEIGHTS) as (keyof typeof FIXED_WEIGHTS)[]) {
          const { face, weight } = FIXED_WEIGHTS[use];
          const w = fixedWeight(tk, use);
          const key = face === "featured" ? tk.typeStyle.featured.font : face;
          const family = tk.typeStyle[key]?.family;
          if (!family) {
            expect(w, `${t.id}/${v.id} ${use}`).toBe(weight);
            continue;
          }
          const faces = FONT_FACES[family]!;
          const italic = face === "featured" && tk.typeStyle.featured.italic;
          expect(italic && faces.italic.length > 0 ? faces.italic : faces.normal, `${t.id}/${v.id} ${use} in ${family}`).toContain(Number(w));
          if (face !== "featured") {
            // faceText gives the same answer: the weight it sets, or none for 400 (React Native's own).
            const style = faceText(tk, face, 10, { weight });
            expect(style.fontWeight ?? "400", `${t.id}/${v.id} ${use}`).toBe(w);
          }
        }
      }
    }
  });

  test("no component sets a weight outside that table", () => {
    // The components that set text in a fixed weight take it from FIXED_WEIGHTS (so it is resolved against the theme's faces), never a literal.
    for (const file of ["aurora-grid.tsx", "guide-ghost.tsx", "glass-button.tsx", "guide-parts.tsx", "guide-sidebar.tsx"]) {
      const src = readFileSync(join(import.meta.dir, file), "utf8");
      const literals = [...src.matchAll(/(?:fontWeight|weight)\s*:\s*"(\d{3})"/g)].map((m) => m[0]);
      expect(literals, file).toEqual([]);
    }
  });
});

describe("whether a theme draws its cells in a frame", () => {
  test("Aurora does not, and it is the theme that decides, never the cell's state", () => {
    expect(themeFramesCells(AURORA)).toBe(false);
    for (const t of GUIDE_THEMES) {
      for (const v of t.variants) {
        const tk = resolveGuideTokens(t.id, v.id);
        // Anything that frames a cell in some state frames the theme in all of them.
        const anyState = cellShadow(tk, false) !== null || cellShadow(tk, true) !== null || ringLayers(tk, "#fff", s).length > 0 || !!tk.misregister?.shapes.includes("ring");
        expect(themeFramesCells(tk), `${t.id}/${v.id}`).toBe(anyState);
      }
    }
  });

  test("a theme whose frame shows only on the selected cell is framed all the same, so focus never changes the cell's views", () => {
    const framedOnlyWhenSelected = GUIDE_THEMES.flatMap((t) =>
      t.variants.map((v) => resolveGuideTokens(t.id, v.id)).filter((tk) => cellShadow(tk, false) === null && themeFramesCells(tk)).map(() => t.id),
    );
    expect(new Set(framedOnlyWhenSelected).size).toBeGreaterThan(0);
  });
});

describe("rings with colors that carry an alpha of their own", () => {
  const withHalo = (color: string) => ({ ...resolveGuideTokens("modern", "dark"), halo: [{ w: 3, color, a: 0.5 }], ringOuter: null });

  test("a halo in rgba() or #rrggbbaa is read, and its alpha scaled", () => {
    expect(ringLayers(withHalo("rgba(255, 0, 0, 0.5)"), "#2f9e8f", s)[0]!.color).toBe("rgba(255, 0, 0, 0.25)");
    expect(ringLayers(withHalo("#ff000080"), "#2f9e8f", s)[0]!.color).toBe("rgba(255, 0, 0, 0.251)");
    expect(ringLayers(withHalo("rgb(10, 20, 30)"), "#2f9e8f", s)[0]!.color).toBe("rgba(10, 20, 30, 0.5)");
    expect(ringLayers(withHalo("accent"), "#2f9e8f", s)[0]!.color).toBe("rgba(47, 158, 143, 0.5)");
  });
});

