/// <reference types="bun" />
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { FIXED_WEIGHTS, FONT_FACES, matchWeight, resolveFontWeight } from "./guide-fonts";
import { GUIDE_THEMES, resolveGuideTokens } from "./guide-themes";
import type { GuideTextRole } from "./guide-tokens";

// The theme fonts are bundled by expo-font's config plugin (apps/tv-native/app.json): on Android each family becomes a font-family
// resource that React Native's font manager resolves by name and weight (so the React Native rows and the native painter get the
// same typeface), and on iOS the files are listed in Info.plist. These tests keep what the themes ask for, what the plugin is told
// to bundle and what is on disk in step, and each family's license shipped with it.
const APP = join(import.meta.dir, "../../..");
const ROLES: GuideTextRole[] = ["title", "sub", "number", "name", "header", "day", "featured"];

type Definition = { path: string; weight: number; style?: string };
type Config = { android: { fonts: { fontFamily: string; fontDefinitions: Definition[] }[] }; ios: { fonts: string[] } };

const app = JSON.parse(readFileSync(join(APP, "app.json"), "utf8")) as { expo: { plugins: unknown[] } };
const entry = app.expo.plugins.find((p): p is [string, Config] => Array.isArray(p) && p[0] === "expo-font");
const config = entry?.[1] as Config;
const registered = config.android.fonts;
const notice = readFileSync(join(APP, "assets/fonts/NOTICE.md"), "utf8");

/** Every (family, weight, italic) the themes set a role in. */
function asked(): Set<string> {
  const out = new Set<string>();
  for (const t of GUIDE_THEMES) {
    for (const v of t.variants) {
      const ts = resolveGuideTokens(t.id, v.id).typeStyle;
      for (const role of ROLES) {
        const r = ts[role];
        const family = (r.font === "display" ? ts.display : ts.text)?.family;
        if (family) out.add(`${family}|${r.weight}|${r.italic ? "italic" : "normal"}`);
      }
    }
  }
  return out;
}

describe("the bundled theme fonts", () => {
  test("the plugin is configured", () => {
    expect(entry).toBeDefined();
    expect(registered.length).toBe(9);
  });

  test("every face a theme asks for is registered, at its exact weight and style", () => {
    const have = new Set(registered.flatMap((f) => f.fontDefinitions.map((d) => `${f.fontFamily}|${d.weight}|${d.style ?? "normal"}`)));
    expect([...asked()].filter((a) => !have.has(a))).toEqual([]);
  });

  test("every registered family is used by a theme, and the families are the ones the themes name", () => {
    const names = new Set([...asked()].map((a) => a.split("|")[0]));
    expect(registered.map((f) => f.fontFamily).sort()).toEqual([...names].sort());
  });

  test("no weight is registered twice for a family, and each is a CSS weight", () => {
    for (const f of registered) {
      const keys = f.fontDefinitions.map((d) => `${d.weight}|${d.style ?? "normal"}`);
      expect(new Set(keys).size, f.fontFamily).toBe(keys.length);
      for (const d of f.fontDefinitions) expect([100, 200, 300, 400, 500, 600, 700, 800, 900], `${f.fontFamily} ${d.weight}`).toContain(d.weight);
    }
  });

  test("every registered file is on disk and is a TrueType font", () => {
    for (const f of registered) {
      for (const d of f.fontDefinitions) {
        const file = join(APP, d.path);
        expect(existsSync(file), d.path).toBe(true);
        const magic = readFileSync(file).subarray(0, 4).toString("hex");
        expect(["00010000", "74727565"], d.path).toContain(magic); // 1.0 or "true"
      }
    }
  });

  test("iOS bundles exactly the files Android does", () => {
    const android = registered.flatMap((f) => f.fontDefinitions.map((d) => d.path)).sort();
    expect([...config.ios.fonts].sort()).toEqual(android);
  });

  test("each family ships its OFL.txt beside its files, and the NOTICE gives the copyright line that file starts with", () => {
    for (const f of registered) {
      const dir = dirname(join(APP, f.fontDefinitions[0]!.path));
      for (const d of f.fontDefinitions) expect(dirname(join(APP, d.path)), f.fontFamily).toBe(dir);
      const ofl = join(dir, "OFL.txt");
      expect(existsSync(ofl), `${f.fontFamily} OFL.txt`).toBe(true);
      const text = readFileSync(ofl, "utf8");
      expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
      const copyright = text.split("\n")[0]!.trim();
      expect(copyright.startsWith("Copyright"), f.fontFamily).toBe(true);
      expect(notice, f.fontFamily).toContain(`${f.fontFamily}\n  ${copyright}\n`);
    }
  });

  test("the Reserved Font Name families are named in the NOTICE as bundled unmodified", () => {
    expect(notice).toContain('"Plex" (IBM Plex Sans Condensed)');
    expect(notice).toContain('"Source" (Source Sans 3)');
    expect(notice).toContain("unmodified");
  });
});

describe("the weights of the bundled families", () => {
  test("FONT_FACES is what the plugin registers, family by family", () => {
    const fromPlugin = Object.fromEntries(
      registered.map((f) => [
        f.fontFamily,
        {
          normal: f.fontDefinitions.filter((d) => !d.style).map((d) => d.weight).sort((a, b) => a - b),
          italic: f.fontDefinitions.filter((d) => d.style === "italic").map((d) => d.weight).sort((a, b) => a - b),
        },
      ]),
    );
    expect(FONT_FACES).toEqual(fromPlugin);
  });
});

describe("matchWeight: the weight a family has for one it lacks", () => {
  test("an exact weight is itself", () => {
    expect(matchWeight([400, 700], 700)).toBe(700);
    expect(matchWeight([400], 400)).toBe(400);
  });

  test("a missing 500 is 400 when there is one, never a bolder weight (CSS Fonts 4, 5.2)", () => {
    expect(matchWeight([400, 700], 500)).toBe(400);
    expect(matchWeight([400, 600, 700], 500)).toBe(400);
    expect(matchWeight([700], 500)).toBe(700); // nothing lighter: then the next weight up
    expect(matchWeight([400, 500, 700], 400)).toBe(400);
    expect(matchWeight([500, 700], 400)).toBe(500); // a 400 looks up to 500 first
  });

  test("a missing weight above 500 is the next one up, else the heaviest below it", () => {
    expect(matchWeight([400, 700], 600)).toBe(700);
    expect(matchWeight([400, 600, 700], 800)).toBe(700);
    expect(matchWeight([400], 800)).toBe(400);
    expect(matchWeight([400, 500, 700, 800], 900)).toBe(800);
  });

  test("a missing weight below 400 is the next one down, else the lightest above it", () => {
    expect(matchWeight([400, 700], 300)).toBe(400);
    expect(matchWeight([200, 400, 700], 300)).toBe(200);
  });

  test("a family with no weights leaves the weight as it was", () => {
    expect(matchWeight([], 600)).toBe(600);
  });
});

describe("resolveFontWeight", () => {
  test("a family the app does not bundle (the system font) keeps the weight", () => {
    expect(resolveFontWeight(null, "800")).toBe("800");
    expect(resolveFontWeight(undefined, "500")).toBe("500");
    expect(resolveFontWeight("Roboto", "600")).toBe("600");
  });

  test("a weight the family has stays", () => {
    expect(resolveFontWeight("Inter Tight", "800")).toBe("800");
    expect(resolveFontWeight("Source Sans 3", "600")).toBe("600");
    expect(resolveFontWeight("Fraunces", "700")).toBe("700");
  });

  test("the weights the families lack are resolved, on purpose", () => {
    // 800: Bangers, Fraunces, Atkinson Hyperlegible and Plex have none.
    expect(resolveFontWeight("Bangers", "800")).toBe("400");
    expect(resolveFontWeight("Fraunces", "800")).toBe("700");
    expect(resolveFontWeight("Atkinson Hyperlegible", "800")).toBe("700");
    expect(resolveFontWeight("IBM Plex Sans Condensed", "800")).toBe("700");
    // 500: Comic Neue, Atkinson Hyperlegible, Plex and Source Sans have none.
    expect(resolveFontWeight("Comic Neue", "500")).toBe("400");
    expect(resolveFontWeight("Atkinson Hyperlegible", "500")).toBe("400");
    expect(resolveFontWeight("IBM Plex Sans Condensed", "500")).toBe("400");
    expect(resolveFontWeight("Source Sans 3", "500")).toBe("400");
    // Fraunces has a Bold and a SemiBold Italic only.
    expect(resolveFontWeight("Fraunces", "400")).toBe("700");
    expect(resolveFontWeight("Fraunces", "700", true)).toBe("600");
    expect(resolveFontWeight("Fraunces", "400", true)).toBe("600");
  });

  test("an italic asked of a family with no italic faces uses its upright ones", () => {
    expect(resolveFontWeight("Inter Tight", "700", true)).toBe("700");
    expect(resolveFontWeight("Bangers", "800", true)).toBe("400");
  });
});

describe("the weights the guide sets text in on its own", () => {
  const FACES = ["text", "display", "featured"] as const;

  test("every one resolves, in every theme's own faces, to a weight that face has", () => {
    for (const t of GUIDE_THEMES) {
      for (const v of t.variants) {
        const ts = resolveGuideTokens(t.id, v.id).typeStyle;
        for (const [use, { face, weight }] of Object.entries(FIXED_WEIGHTS)) {
          expect(FACES, use).toContain(face);
          const key = face === "featured" ? ts.featured.font : face;
          const family = ts[key]?.family;
          if (!family) continue; // the system font: the platform's own faces
          const italic = face === "featured" && ts.featured.italic;
          const faces = FONT_FACES[family]!;
          const have = italic && faces.italic.length > 0 ? faces.italic : faces.normal;
          expect(have, `${t.id}/${v.id} ${use} (${weight}) in ${family}`).toContain(Number(resolveFontWeight(family, weight, italic)));
        }
      }
    }
  });

  test("they are the weights that were hard-coded, and only those", () => {
    expect(Object.fromEntries(Object.entries(FIXED_WEIGHTS).map(([k, v]) => [k, `${v.face}:${v.weight}`]))).toEqual({
      status: "text:700",
      ghost: "display:800",
      glassLabel: "text:600",
      glassSub: "text:500",
      episode: "featured:400",
    });
  });
});

