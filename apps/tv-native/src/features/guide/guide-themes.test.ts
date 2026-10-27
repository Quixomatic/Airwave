/// <reference types="bun" />
import { describe, expect, test } from "bun:test";

import { parseColor } from "./color";
import { tokenProblems } from "./guide-token-checks";
import {
  DEFAULT_GUIDE_THEME,
  DEFAULT_GUIDE_VARIANT,
  deepMerge,
  findGuideTheme,
  findGuideVariant,
  GUIDE_THEMES,
  guideSwatch,
  isGuideThemeId,
  isGuideVariantId,
  resolveGuideTokens,
} from "./guide-themes";
import { AURORA, type GuideTokens } from "./guide-tokens";
import { analyze, chromeFailures, failures } from "./theme-contrast";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const ALL = GUIDE_THEMES.flatMap((t) => t.variants.map((v) => [`${t.id}/${v.id}`, t.id, v.id] as const));
const NON_AURORA = ALL.filter(([, theme]) => theme !== "aurora");

describe("deepMerge", () => {
  test("plain objects merge key by key, all the way down", () => {
    expect(deepMerge<unknown>({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 9 }, e: 4 })).toEqual({ a: 1, b: { c: 9, d: 3 }, e: 4 });
  });

  test("scalars, arrays and null replace wholesale", () => {
    expect(deepMerge<unknown>({ a: [1, 2, 3], b: "x", c: { d: 1 } }, { a: [9], b: "y", c: null })).toEqual({ a: [9], b: "y", c: null });
    expect(deepMerge<unknown>({ a: null }, { a: { b: 1 } })).toEqual({ a: { b: 1 } }); // an object over null is the whole object
    expect(deepMerge<unknown>({ a: { b: 1 } }, { a: [1] })).toEqual({ a: [1] });
  });

  test("a key the patch leaves undefined is left alone, and neither input changes", () => {
    const base = { a: { b: 1 }, c: 2 };
    const patch = { a: { b: undefined }, c: undefined };
    const before = clone(base);
    expect(deepMerge(base, patch)).toEqual(before);
    expect(base).toEqual(before);
    expect(patch).toEqual({ a: { b: undefined }, c: undefined });
    expect(deepMerge(base, undefined)).toBe(base);
  });
});

describe("the registry", () => {
  test("Aurora comes first, then the eight themes, each with its variants", () => {
    expect(GUIDE_THEMES.map((t) => t.id)).toEqual(["aurora", "modern", "high-contrast", "risograph", "pop-art", "neo-brutalist", "swiss-poster", "blueprint", "editorial"]);
    expect(GUIDE_THEMES.map((t) => t.variants.length)).toEqual([1, 4, 3, 4, 3, 4, 3, 3, 3]);
    expect(NON_AURORA).toHaveLength(27);
    expect(DEFAULT_GUIDE_THEME).toBe("aurora");
    expect(DEFAULT_GUIDE_VARIANT).toBe("default");
  });

  test("Modern carries Dark and Light as variants, not as themes", () => {
    const modern = findGuideTheme("modern");
    expect(modern.variants.map((v) => [v.id, v.scheme, v.kind])).toEqual([
      ["dark", "dark", "palette"],
      ["light", "light", "palette"],
      ["ember", "dark", "accent"],
      ["lagoon", "dark", "accent"],
    ]);
    expect(GUIDE_THEMES.some((t) => /dark|light/i.test(t.id))).toBe(false);
  });

  test("every theme and variant is named, described and uniquely identified", () => {
    expect(new Set(GUIDE_THEMES.map((t) => t.id)).size).toBe(GUIDE_THEMES.length);
    expect(new Set(GUIDE_THEMES.map((t) => t.name)).size).toBe(GUIDE_THEMES.length);
    for (const t of GUIDE_THEMES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
      expect(new Set(t.variants.map((v) => v.id)).size).toBe(t.variants.length);
      for (const v of t.variants) {
        expect(v.id).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(v.name.length).toBeGreaterThan(0);
        expect(v.description.length).toBeGreaterThan(0);
        expect(["palette", "accent"]).toContain(v.kind);
        expect(["dark", "light"]).toContain(v.scheme);
      }
    }
  });

  test("the first variant is the default and changes nothing from its theme", () => {
    for (const t of GUIDE_THEMES) {
      expect(t.defaultVariant).toBe(t.variants[0]!.id);
      expect(t.variants[0]!.overrides).toEqual({});
    }
    expect(findGuideTheme("aurora").variants.map((v) => v.id)).toEqual([DEFAULT_GUIDE_VARIANT]);
  });

  test("an accent variant repaints the accent and leaves its theme's surfaces, inks and type alone", () => {
    for (const t of GUIDE_THEMES) {
      for (const v of t.variants.filter((x) => x.kind === "accent")) {
        const keys = Object.keys(v.overrides);
        expect(keys.length).toBeGreaterThan(0);
        for (const surface of ["bg", "cellBg", "title", "sub", "typeStyle", "patterns", "art", "railBg", "scrim"]) {
          if (surface === "art" && t.id === "swiss-poster") continue; // the poster color is the placeholder art's too
          expect(keys, `${t.id}/${v.id}`).not.toContain(surface);
        }
      }
    }
  });

  test("lookup: an unknown theme is Aurora and an unknown variant is the theme's default", () => {
    expect(findGuideTheme("neon").id).toBe("aurora");
    expect(findGuideTheme(undefined).id).toBe("aurora");
    expect(findGuideVariant(findGuideTheme("modern"), "nope").id).toBe("dark");
    expect(findGuideVariant(findGuideTheme("modern"), "light").id).toBe("light");
    expect(isGuideThemeId("blueprint")).toBe(true);
    for (const v of ["", "Blueprint", "neon", null, undefined, 3, {}]) expect(isGuideThemeId(v)).toBe(false);
    expect(isGuideVariantId("modern", "ember")).toBe(true);
    expect(isGuideVariantId("modern", "signal")).toBe(false); // another theme's
    expect(isGuideVariantId("neon", "default")).toBe(false);
    expect(isGuideVariantId("aurora", DEFAULT_GUIDE_VARIANT)).toBe(true);
  });
});

describe("resolution", () => {
  test("Aurora resolves to AURORA itself, whatever the variant asked for", () => {
    expect(resolveGuideTokens()).toBe(AURORA);
    expect(resolveGuideTokens("aurora")).toBe(AURORA);
    expect(resolveGuideTokens("aurora", "default")).toBe(AURORA);
    expect(resolveGuideTokens("aurora", "whatever")).toBe(AURORA);
  });

  test("an unknown theme resolves to Aurora and an unknown variant to the theme's default", () => {
    expect(resolveGuideTokens("neon", "dark")).toBe(AURORA);
    expect(resolveGuideTokens("modern", "nope")).toBe(resolveGuideTokens("modern", "dark"));
    expect(resolveGuideTokens("modern")).toBe(resolveGuideTokens("modern", "dark"));
    expect(resolveGuideTokens("modern", "signal")).toBe(resolveGuideTokens("modern", "dark")); // another theme's variant
  });

  test("the same choice is always the same object", () => {
    for (const [, theme, variant] of ALL) expect(resolveGuideTokens(theme, variant)).toBe(resolveGuideTokens(theme, variant));
  });

  test("a variant is deepMerge(deepMerge(AURORA, theme.tokens), variant.overrides), with the type style's weights", () => {
    for (const t of GUIDE_THEMES) {
      for (const v of t.variants) {
        if (t.id === "aurora") continue;
        const expected = deepMerge(deepMerge(AURORA, t.tokens), v.overrides);
        expected.titleWeight = expected.typeStyle.title.weight;
        expected.numberWeight = expected.typeStyle.number.weight;
        expect(resolveGuideTokens(t.id, v.id)).toEqual(expected);
      }
    }
  });

  test("resolving never changes Aurora, a theme or a variant", () => {
    const before = clone({ aurora: AURORA, themes: GUIDE_THEMES });
    for (const [, theme, variant] of ALL) resolveGuideTokens(theme, variant);
    expect(clone({ aurora: AURORA, themes: GUIDE_THEMES })).toEqual(before);
  });

  test("a field a theme does not mention is Aurora's", () => {
    const modern = resolveGuideTokens("modern", "dark");
    for (const k of ["railLayout", "railDivider", "misregister", "patterns", "headerStyle", "featuredPlate", "focusText", "liveText", "cellRule", "cellBorderDash"] as const) {
      expect(modern[k]).toEqual(AURORA[k]);
    }
    // And a patch that mentions one field of an object leaves its other fields alone.
    expect(resolveGuideTokens("high-contrast", "signal").railBar).toEqual({ ...AURORA.railBar, w: 0 });
  });

  test("every variant of a theme is a different look", () => {
    for (const t of GUIDE_THEMES) {
      const looks = t.variants.map((v) => JSON.stringify(resolveGuideTokens(t.id, v.id)));
      expect(new Set(looks).size).toBe(looks.length);
    }
  });

  test("Aurora's ground differs from every other theme's, and a theme's variants keep its structure", () => {
    for (const t of GUIDE_THEMES.filter((x) => x.id !== "aurora")) {
      const base = resolveGuideTokens(t.id, t.defaultVariant);
      expect(base.bg.toLowerCase()).not.toBe(AURORA.bg.toLowerCase());
      for (const v of t.variants) {
        const tk = resolveGuideTokens(t.id, v.id);
        // Variants repaint a theme; they do not rearrange it.
        expect([tk.railLayout, tk.art.layout, tk.progress.style, tk.statusLabel.mode, tk.typeStyle.display?.family]).toEqual([
          base.railLayout,
          base.art.layout,
          base.progress.style,
          base.statusLabel.mode,
          base.typeStyle.display?.family,
        ]);
      }
    }
  });
});

describe("Aurora's defaults for everything themes added are the 'off' values", () => {
  test("no extra look: the stock rail, circle, cell, progress and header", () => {
    const a = AURORA;
    expect([a.accentMode, a.accentCycle, a.rowBorderW, a.railBg, a.railFocus, a.railDivider, a.railLayout]).toEqual(["channel", null, null, "transparent", null, null, "aurora"]);
    expect(a.railBar).toEqual({ w: 4, r: 0, color: null });
    expect(a.circleStyle).toEqual({ radius: 0.5, scale: 1, fill: "accent", border: "accent", borderW: null, glyph: "accent", marks: null });
    expect(a.glyphStroke).toBe(2);
    expect([a.cellFocusBg, a.focusText, a.liveText, a.cellBorderDash, a.cellRule, a.shadow, a.shadowFocus, a.highlight, a.halo, a.ringOuter]).toEqual(Array(10).fill(null));
    expect(a.liveBar).toEqual({ w: 3, r: 4, x: 3, inset: 10, color: null });
    expect(a.progress.style).toBe("none");
    expect(a.statusLabel).toEqual({ mode: "none" });
    expect([a.art.layout, a.art.frameW]).toEqual(["full", 0]);
    expect(a.patterns).toEqual({ bg: null, overlay: null });
    expect([a.misregister, a.headerStyle, a.featuredPlate, a.favStroke]).toEqual([null, null, null, null]);
    expect(a.featuredName).toBe("accent");
  });

  test("every text role is the system font, in the weight the rows always used, with no case, tracking or scale", () => {
    const { display, text, ...roles } = AURORA.typeStyle;
    expect([display, text]).toEqual([null, null]);
    expect(Object.keys(roles).sort()).toEqual(["day", "featured", "header", "name", "number", "sub", "title"]);
    for (const r of Object.values(roles)) expect(r).toMatchObject({ font: "text", case: "none", track: 0, scale: 1, italic: false });
    expect(AURORA.typeStyle.title.weight).toBe(AURORA.titleWeight);
    expect(AURORA.typeStyle.number.weight).toBe(AURORA.numberWeight);
    expect([AURORA.typeStyle.sub.weight, AURORA.typeStyle.name.weight, AURORA.typeStyle.header.weight, AURORA.typeStyle.day.weight, AURORA.typeStyle.featured.weight]).toEqual(["400", "400", "600", "600", "700"]);
  });
});

describe("every variant parses", () => {
  for (const [name, theme, variant] of ALL) {
    test(`${name} is a complete, valid token set`, () => {
      expect(tokenProblems(resolveGuideTokens(theme, variant))).toEqual([]);
    });
  }

  test("the checker catches what it is for", () => {
    const broken = (patch: object): GuideTokens => deepMerge(clone(AURORA), patch);
    const has = (tk: GuideTokens, part: string) => tokenProblems(tk).some((p) => p.includes(part));
    expect(has(broken({ bg: "navy" }), "bg")).toBe(true);
    expect(has(broken({ accentMode: "rainbow" }), "accentMode")).toBe(true);
    expect(has(broken({ railBar: { w: -1 } }), "railBar.w")).toBe(true);
    expect(has(broken({ circle: { fillA: 1.5 } }), "circle.fillA")).toBe(true);
    expect(has(broken({ accentMode: "fixed" }), "accentFixed")).toBe(true);
    expect(has(broken({ typeStyle: { title: { font: "display" } } }), "display face")).toBe(true);
    expect(has(broken({ titleWeight: "800" }), "titleWeight")).toBe(true);
    expect(has(broken({ progress: { style: "ticks" } }), "progress.ticks")).toBe(true);
    const missing = clone(AURORA) as unknown as Record<string, unknown>;
    delete missing.halo;
    expect(has(missing as unknown as GuideTokens, "halo")).toBe(true);
    expect(tokenProblems(clone(AURORA))).toEqual([]);
  });

  test("a theme's fonts are bundled families, never the system's name for one", () => {
    const families = new Set<string>();
    for (const [, theme, variant] of ALL) {
      const ts = resolveGuideTokens(theme, variant).typeStyle;
      for (const f of [ts.display, ts.text]) if (f) families.add(f.family);
    }
    expect([...families].sort()).toEqual(
      ["Atkinson Hyperlegible", "Bangers", "Bricolage Grotesque", "Comic Neue", "Epilogue", "Fraunces", "IBM Plex Sans Condensed", "Inter Tight", "Source Sans 3"].sort(),
    );
  });
});

// The contrast gate: text 4.5:1 (High Contrast 7:1), graphics and marks 3:1, worst case over every accent a row can carry. It also holds
// the chrome the rows do not draw (`chromeFailures`): the sidebar's labels and icon on its panel, the empty state and the featured
// panel's tagline, summary and status line.
describe("contrast gate", () => {
  const fmt = (c: { label: string; ratio: number; need: number; who: string }) => `${c.label}: ${c.ratio.toFixed(2)} < ${c.need}${c.who ? ` (${c.who})` : ""}`;

  for (const [name, theme, variant] of NON_AURORA) {
    test(`${name} meets every minimum`, () => {
      const need = theme === "high-contrast" ? 7 : 4.5;
      const tk = resolveGuideTokens(theme, variant);
      expect([...failures(tk, need), ...chromeFailures(tk, need)].map(fmt)).toEqual([]);
    });
  }

  /**
   * Aurora is the default and stays exactly as it is, so it is held to what it is rather than to the table: this list must match
   * its failures exactly, so a new gap fails the test, and so does closing one without taking it off the list. The sub-line on the
   * on-now fill of the lightest tints (yellow, 3.95:1) and the featured panel's channel number over the palest fallback tint (3.09:1),
   * and, among the chrome, the sidebar's sub-label and the featured tagline (both its slate grey, 3.96:1 and 4.16:1).
   */
  test("Aurora has no gaps beyond the known ones", () => {
    const labels = failures(AURORA, 4.5).map((c) => c.label);
    expect(labels.sort()).toEqual(["header and featured-panel text", "sub-line, focusLive", "sub-line, live"]);
    expect(chromeFailures(AURORA, 4.5).map((c) => c.label).sort()).toEqual(["featured tagline", "sidebar sub-label"]);
  });

  test("High Contrast clears 7:1 for text in every variant, with room to spare", () => {
    for (const v of findGuideTheme("high-contrast").variants) {
      const text = analyze(resolveGuideTokens("high-contrast", v.id), 7).filter((c) => c.kind === "text");
      expect(Math.min(...text.map((c) => c.ratio))).toBeGreaterThan(8);
    }
  });

  test("the gate sees a failure: a title the color of its cell", () => {
    const tk = deepMerge(AURORA, { title: "#0e1320" });
    expect(failures(tk).map((c) => c.label)).toContain("title, rest");
  });
});

describe("the picker's swatch", () => {
  test("is four colors drawn from the variant: ground, surface, accent and ink", () => {
    for (const [name, theme, variant] of ALL) {
      const tk = resolveGuideTokens(theme, variant);
      const [ground, surface, accent, ink] = guideSwatch(tk);
      expect(ground, name).toBe(tk.bg);
      expect(ink, name).toBe(tk.title);
      for (const c of [ground, surface, accent, ink]) expect(() => parseColor(c), name).not.toThrow();
      expect(parseColor(surface).a, name).toBe(1);
    }
  });

  test("the accent is the variant's own color where it has one, and the ring where each channel brings its own", () => {
    expect(guideSwatch(resolveGuideTokens("modern", "ember"))[2]).toBe(resolveGuideTokens("modern", "ember").accentFixed ?? "");
    expect(guideSwatch(resolveGuideTokens("pop-art", "sunny"))[2]).toBe(resolveGuideTokens("pop-art", "sunny").accentCycle?.[0] ?? "");
    expect(guideSwatch(AURORA)[2]).toBe(AURORA.ring);
    expect(guideSwatch(resolveGuideTokens("modern", "dark"))[2]).toBe(resolveGuideTokens("modern", "dark").ring);
  });
});
