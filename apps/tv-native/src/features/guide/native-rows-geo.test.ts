/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import fixture from "../../../../../packages/native-guide/android/src/test/resources/aurora-fixture.json";
import themesFixture from "../../../../../packages/native-guide/android/src/test/resources/themes-fixture.json";
import { buildAuroraFixture, buildThemesFixture } from "../../../../../packages/native-guide/scripts/gen-geometry-fixture";
import { over, toHex } from "./color";
import { WINDOW_MIN } from "./geometry";
import { GUIDE_THEMES, resolveGuideTokens } from "./guide-themes";
import { AURORA, accentFg, type GuideTokens } from "./guide-tokens";
import { auroraGeo, ROW_BORDER_TOP, rowTokens, type AuroraGeoInput, type Scalers } from "./native-rows-geo";

// Scalers with round numbers, so each expected value below is easy to follow: 1000 dp wide (a spec px is 0.390625 dp),
// chrome halved, hairlines snapped to half a dp.
const scalers: Scalers = {
  vw: (px) => (px / 2560) * 1000,
  cs: (px) => px * 0.5,
  line: (px) => Math.max(0.5, Math.round(px * 0.5 * 2) / 2),
};
const input: AuroraGeoInput = { rowPx: 65.625, railPx: 74, laneW: 800, ppm: 4, originMs: 1_000, gap: 3, featureScale: 0.76 };

// The variants these tests lean on: the one that doubles the focus ring and scales text up, the square borderless one, and the
// themes' own (variant, theme) pairs for the every-one loops.
const HIGH_CONTRAST = resolveGuideTokens("high-contrast", "signal");
const SWISS = resolveGuideTokens("swiss-poster", "vermilion");
const ALL: GuideTokens[] = GUIDE_THEMES.flatMap((t) => t.variants.map((v) => resolveGuideTokens(t.id, v.id)));

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
    expect(geo.unit).toBe(vw(1)); // dp per design px
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
    const geo2 = auroraGeo(input, scalers, { ...AURORA, ringW: 4, cellBorderW: 2, cellRadius: 12, liveBar: { ...AURORA.liveBar, w: 5, r: 6 } });
    expect([geo2.cellRing, geo2.circleRing, geo2.cellBorder, geo2.cellRadius, geo2.liveBarW, geo2.liveBarR]).toEqual([2, 2, 1, 6, 2.5, 3]);
  });

  test("is JSON the native side can parse back unchanged", () => {
    expect(JSON.parse(JSON.stringify(geo))).toEqual(geo);
  });

  test("a channel logo's box is sized by AuroraGrid's own expressions; a plate insets the logo, none leaves it flush", () => {
    const vw = scalers.vw;
    expect(geo.logoGap).toBe(vw(8));
    expect(geo.logoRadius).toBe(3); // cs(6)
    expect(geo.logoPad).toBe(0); // Aurora has no plate
    expect(auroraGeo(input, scalers, { ...AURORA, logoPlate: "rgba(29,36,48,0.9)" }).logoPad).toBe(vw(4)); // a theme that plates its logos
  });

  test("Aurora has no outer ring", () => {
    expect(geo.ringOuterW).toBe(0);
  });

  test("a theme's zero widths and radii stay zero instead of snapping up to a hairline", () => {
    const swiss = auroraGeo(input, scalers, SWISS);
    expect([swiss.cellBorder, swiss.cellRadius, swiss.liveBarR, swiss.liveBarW, swiss.ringOuterW]).toEqual([0, 0, 0, 0, 0]);
    expect(swiss.cellRing).toBe(4); // line(7.5): the selected cell still has its ring
  });

  test("a theme's outer ring is sent as a snapped line width", () => {
    expect(HIGH_CONTRAST.ringOuter).toEqual({ color: "#ffffff", w: 2.25, gap: 3, dash: null });
    expect(auroraGeo(input, scalers, HIGH_CONTRAST).ringOuterW).toBe(1); // line(2.25)
  });

  test("fontScale scales the text sizes and nothing else", () => {
    const plain = auroraGeo(input, scalers, AURORA);
    const big = auroraGeo(input, scalers, HIGH_CONTRAST);
    const fs = HIGH_CONTRAST.fontScale;
    expect(fs).toBe(1.12);
    expect(big.titleSize).toBe(scalers.vw(34) * fs);
    expect(big.subSize).toBe(scalers.vw(26) * fs);
    expect(big.numberSize).toBe(scalers.vw(34) * fs);
    expect(big.nameSize).toBe(scalers.vw(23) * fs);
    expect(big.nameLine).toBe(scalers.vw(23) * fs * 1.2);
    // Every position and box stays where Aurora has it.
    for (const k of ["rowH", "railW", "padV", "padH", "circle", "glyph", "cellTop", "cellInset", "padTop", "padX", "subGap", "liveBarX", "liveBarInset"] as const) {
      expect(big[k]).toBe(plain[k]);
    }
  });

  test("every variant's geo is plain, finite numbers the native side can read", () => {
    for (const tk of ALL) {
      const g = auroraGeo(input, scalers, tk);
      for (const [k, v] of Object.entries(g)) expect(Number.isFinite(v), `${tk.bg}.${k}`).toBe(true);
      expect(JSON.parse(JSON.stringify(g))).toEqual(g);
    }
  });
});

/** The fields of the token set a theme added: sent as they are, sizes in design px. */
const ADDED = [
  "typeStyle", "accentMode", "accentCycle", "rowBorderW", "railBg", "railFocus", "railBar", "railDivider", "railLayout", "circleStyle",
  "glyphStroke", "cellFocusBg", "focusText", "liveText", "cellBorderDash", "cellRule", "shadow", "shadowFocus", "highlight", "halo",
  "progress", "statusLabel", "art", "patterns", "misregister", "headerStyle", "featuredName", "featuredPlate", "favStroke",
] as const;

describe("rowTokens", () => {
  test("are Aurora's colors, alphas and weights", () => {
    expect(rowTokens(AURORA)).toMatchObject({
      rowBorder: "rgba(148,163,184,0.12)",
      cellBg: "rgba(148,163,184,0.05)",
      liveCellBg: "transparent",
      cellBorder: "rgba(148,163,184,0.10)",
      ring: "#3b82f6",
      ringOuter: null,
      liveFill: { mode: "tint", elapsed: 0.32, remain: 0.1 },
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
      accentShade: 0,
      accentFixed: null,
      logoPlate: "transparent",
      artScrim: ["rgba(6,10,20,0.88)", "rgba(6,10,20,0.8)"],
      artTitle: "#f1f5f9",
      artSub: "#e6ebf2",
    });
  });

  test("everything a theme added goes over as the token set has it, and the stock look is the 'off' values", () => {
    for (const tk of ALL) {
      const t = rowTokens(tk) as Record<string, unknown>;
      for (const k of ADDED) expect(t[k], k).toEqual(tk[k]);
      expect(t.liveBar).toEqual({ x: tk.liveBar.x, inset: tk.liveBar.inset, color: tk.liveBar.color });
    }
    const a = rowTokens(AURORA);
    expect([a.accentMode, a.railLayout, a.progress.style, a.statusLabel.mode, a.art.layout, a.misregister, a.headerStyle, a.rowBorderW]).toEqual(["channel", "aurora", "none", "none", "full", null, null, null]);
    expect(a.liveBar).toEqual({ x: 3, inset: 10, color: null });
  });

  test("the outer ring goes over as its color, gap and dashes", () => {
    expect(rowTokens(AURORA).ringOuter).toBeNull();
    expect(rowTokens(HIGH_CONTRAST).ringOuter).toEqual({ color: "#ffffff", gap: 3, dash: null });
    expect(rowTokens(resolveGuideTokens("blueprint", "cyanotype")).ringOuter).toEqual({ color: "#ffffff", gap: 3, dash: [8, 5] });
  });

  test("a theme's art scrim and text colors are sent as it defines them", () => {
    for (const tk of ALL) {
      expect(rowTokens(tk)).toMatchObject({ artScrim: [tk.artScrim[0], tk.artScrim[1]], artTitle: tk.artTitle, artSub: tk.artSub });
    }
  });

  test("the plate behind a logo is a token", () => {
    expect(rowTokens(AURORA).logoPlate).toBe("transparent");
    expect(rowTokens({ ...AURORA, logoPlate: "rgba(29,36,48,0.9)" }).logoPlate).toBe("rgba(29,36,48,0.9)");
  });

  test("a neutral live fill sends its two colors, a tinted one its two alphas", () => {
    expect(rowTokens(HIGH_CONTRAST).liveFill).toEqual({ mode: "neutral", elapsed: HIGH_CONTRAST.liveFill.elapsed, remain: HIGH_CONTRAST.liveFill.remain });
    expect(rowTokens(resolveGuideTokens("modern", "dark")).liveFill.mode).toBe("tint");
  });

  test("a theme's mark color is derived from accentShade, accentFixed and title", () => {
    expect(rowTokens(HIGH_CONTRAST)).toMatchObject({ accentFixed: "#ffffff", ringOuter: { color: "#ffffff" }, title: "#ffffff" });
    expect(rowTokens(resolveGuideTokens("modern", "light"))).toMatchObject({ accentShade: 0.5, accentFixed: null, ringOuter: null, title: "#0f172a" });
    expect(rowTokens(SWISS)).toMatchObject({ cellBorder: "transparent" });
  });

  test("every variant's tokens are JSON the native side can parse back unchanged", () => {
    for (const tk of ALL) {
      const t = rowTokens(tk);
      expect(JSON.parse(JSON.stringify(t))).toEqual(t);
    }
  });

  test("railGround is what the rail sits on: the rail's own color over the guide's ground, opaque", () => {
    expect(rowTokens(AURORA).railGround).toBe("#060a14"); // Aurora's rail is transparent: the ground itself
    for (const t of GUIDE_THEMES) {
      for (const v of t.variants) {
        const tk = resolveGuideTokens(t.id, v.id);
        const ground = rowTokens(tk).railGround;
        expect(ground, `${t.id}/${v.id}`).toMatch(/^#[0-9a-f]{6}$/);
        expect(ground).toBe(toHex(over(tk.railBg, tk.bg))); // the helper is this expression, written once
      }
    }
  });

  test("none of the featured panel's, sidebar's or time header's own colors: those stay in JS", () => {
    const keys = Object.keys(rowTokens(AURORA));
    for (const other of ["bg", "scrim", "now", "featured", "badge", "sidebar", "glass", "ghost", "headerDay", "headerTick", "fontScale"]) expect(keys).not.toContain(other);
  });
});

describe("themes-fixture.json", () => {
  test("is what the generator builds now (run packages/native-guide/scripts/gen-geometry-fixture.ts after changing a theme)", () => {
    const { about, ...rest } = themesFixture;
    expect(about.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(buildThemesFixture()))).toEqual(rest);
  });

  test("lists every theme, and every variant of each with a mark color for each of the 24 accents", () => {
    expect(themesFixture.themes.map((t) => t.id)).toEqual(GUIDE_THEMES.map((t) => t.id));
    expect(themesFixture.accents).toHaveLength(24);
    expect(themesFixture.variants.map((v) => `${v.theme}/${v.variant}`)).toEqual(GUIDE_THEMES.flatMap((t) => t.variants.map((v) => `${t.id}/${v.id}`)));
    for (const v of themesFixture.variants) {
      expect(v.marks).toHaveLength(24);
      const tk = resolveGuideTokens(v.theme, v.variant);
      themesFixture.accents.forEach((a, i) => expect(v.marks[i], `${v.theme}/${v.variant}`).toBe(accentFg(tk, a)));
      expect(v.tokens).toEqual(JSON.parse(JSON.stringify(rowTokens(tk))));
    }
  });

  test("a theme's entry is its default variant's geo and tokens", () => {
    for (const t of themesFixture.themes) {
      const def = GUIDE_THEMES.find((x) => x.id === t.id)!.defaultVariant;
      expect(t.variant).toBe(def);
      expect(themesFixture.variants.find((v) => v.theme === t.id && v.variant === def)!.tokens).toEqual(t.tokens);
    }
  });

  test("Aurora's entry is the Aurora fixture", () => {
    const { about: _about, ...aurora } = fixture;
    const { id: _id, variant: _variant, ...entry } = themesFixture.themes[0]!;
    expect(entry).toEqual(aurora);
  });
});

describe("aurora-fixture.json", () => {
  test("is what the generator builds now (run packages/native-guide/scripts/gen-geometry-fixture.ts after changing the geometry or tokens)", () => {
    const { about, ...rest } = fixture;
    expect(about.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(buildAuroraFixture()))).toEqual(rest);
  });
});
