/// <reference types="bun" />
import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

// The prefs persist through AsyncStorage, which needs the native module: stand in a Map for it before loading the file, so
// the store's hydrate / persist round trip runs for real.
const store = new Map<string, string>();
let readFails = false;
const setItem = mock(async (key: string, value: string) => {
  store.set(key, value);
});
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => {
      if (readFails) throw new Error("storage unavailable");
      return store.get(key) ?? null;
    },
    setItem,
  },
}));

let prefs: typeof import("./guide-prefs");
beforeAll(async () => {
  prefs = await import("./guide-prefs");
});

const KEY = "cg-guide-prefs";
const DEFAULTS = { theme: "aurora", variant: "default", marks: "icons", art: "off", rows: "native" } as const;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  store.clear();
  readFails = false;
  setItem.mockClear();
  await prefs.hydrateGuidePrefs(); // back to the defaults
});

describe("parseGuidePrefs", () => {
  test("the defaults are Aurora's default variant, no program art and the native rows", () => {
    expect(prefs.DEFAULT_GUIDE_PREFS).toEqual(DEFAULTS);
    for (const raw of [null, undefined, ""]) expect(prefs.parseGuidePrefs(raw)).toEqual(DEFAULTS);
  });

  test("reads stored values", () => {
    expect(prefs.parseGuidePrefs('{"theme":"modern","variant":"light"}')).toEqual({ ...DEFAULTS, theme: "modern", variant: "light" });
    expect(prefs.parseGuidePrefs('{"theme":"blueprint","variant":"sepia","rows":"classic"}')).toEqual({ ...DEFAULTS, theme: "blueprint", variant: "sepia", rows: "classic" });
    expect(prefs.parseGuidePrefs('{"art":"on"}')).toEqual({ ...DEFAULTS, art: "on" });
    expect(prefs.parseGuidePrefs('{"marks":"logos"}')).toEqual({ ...DEFAULTS, marks: "logos" });
    expect(prefs.parseGuidePrefs('{"rows":"native"}')).toEqual(DEFAULTS);
  });

  test("a theme with no variant, or one that is not its own, gets the theme's default variant", () => {
    expect(prefs.parseGuidePrefs('{"theme":"modern"}')).toEqual({ ...DEFAULTS, theme: "modern", variant: "dark" });
    expect(prefs.parseGuidePrefs('{"theme":"high-contrast","variant":"default"}')).toEqual({ ...DEFAULTS, theme: "high-contrast", variant: "signal" });
    expect(prefs.parseGuidePrefs('{"theme":"modern","variant":"signal"}')).toEqual({ ...DEFAULTS, theme: "modern", variant: "dark" }); // another theme's
    expect(prefs.parseGuidePrefs('{"theme":"aurora","variant":"light"}')).toEqual(DEFAULTS);
    expect(prefs.parseGuidePrefs('{"variant":"light"}')).toEqual(DEFAULTS); // no theme: Aurora, which has no light variant
  });

  test("a missing, unknown or invalid field falls back to its own default and leaves the others alone", () => {
    expect(prefs.parseGuidePrefs('{"theme":"neon","variant":"light","rows":"classic"}')).toEqual({ ...DEFAULTS, rows: "classic" });
    expect(prefs.parseGuidePrefs('{"theme":"pop-art","rows":"turbo","art":"on"}')).toEqual({ ...DEFAULTS, theme: "pop-art", variant: "sunny", art: "on" });
    for (const bad of ['{"theme":3}', '{"theme":null}', '{"theme":"Modern"}', '{"variant":3}', '{"variant":""}', '{"variant":null}', '{"rows":42}', '{"rows":null}', '{"art":true}', '{"art":"yes"}', '{"art":1}', '{"marks":"logo"}', '{"marks":true}', '{"other":"x"}', "{}"]) {
      expect(prefs.parseGuidePrefs(bad)).toEqual(DEFAULTS);
    }
  });

  test("anything that is not a JSON object falls back to the defaults", () => {
    for (const raw of ["not json", "[]", '"modern"', "7", "null", "{"]) expect(prefs.parseGuidePrefs(raw)).toEqual(DEFAULTS);
  });

  test("ignores fields it does not know", () => {
    expect(prefs.parseGuidePrefs('{"theme":"editorial","variant":"evening","rows":"classic","extra":1}')).toEqual({ ...DEFAULTS, theme: "editorial", variant: "evening", rows: "classic" });
  });
});

describe("the pref store", () => {
  test("starts at the defaults", () => {
    expect(prefs.getGuidePrefs()).toEqual(DEFAULTS);
  });

  test("hydrates what an earlier run stored under cg-guide-prefs", async () => {
    store.set(KEY, '{"theme":"neo-brutalist","variant":"asphalt","marks":"logos","art":"on","rows":"classic"}');
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs()).toEqual({ theme: "neo-brutalist", variant: "asphalt", marks: "logos", art: "on", rows: "classic" });
  });

  test("hydrating invalid storage leaves the defaults for the bad fields", async () => {
    store.set(KEY, '{"theme":"neon","variant":"light","rows":"nope"}');
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs()).toEqual(DEFAULTS);
  });

  test("a storage failure never blocks launch, and keeps what the store held", async () => {
    prefs.setGuidePrefs({ theme: "modern" });
    readFails = true;
    await expect(prefs.hydrateGuidePrefs()).resolves.toBeUndefined();
    expect(prefs.getGuidePrefs()).toEqual({ ...DEFAULTS, theme: "modern", variant: "dark" });
  });

  test("a change persists as JSON and survives a relaunch", async () => {
    prefs.setGuidePrefs({ rows: "classic" });
    await flush();
    expect(JSON.parse(store.get(KEY)!)).toEqual({ theme: "aurora", variant: "default", marks: "icons", art: "off", rows: "classic" });
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs().rows).toBe("classic");
  });

  test("what set writes, hydrate reads back", async () => {
    prefs.setGuidePrefs({ theme: "modern" });
    prefs.setGuidePrefs({ theme: "aurora" });
    prefs.setGuidePrefs({ theme: "swiss-poster", variant: "noir", marks: "logos", art: "on", rows: "classic" });
    const written = store.get(KEY)!;
    store.clear();
    store.set(KEY, written);
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs()).toEqual({ theme: "swiss-poster", variant: "noir", marks: "logos", art: "on", rows: "classic" });
  });

  test("choosing a theme starts on its default variant, and choosing a variant changes only that", () => {
    prefs.setGuidePrefs({ theme: "modern" });
    expect(prefs.getGuidePrefs()).toMatchObject({ theme: "modern", variant: "dark" });
    prefs.setGuidePrefs({ variant: "light" });
    expect(prefs.getGuidePrefs()).toEqual({ ...DEFAULTS, theme: "modern", variant: "light" });
    prefs.setGuidePrefs({ theme: "modern" }); // the same theme again keeps the variant
    expect(prefs.getGuidePrefs().variant).toBe("light");
    prefs.setGuidePrefs({ theme: "high-contrast" }); // another theme does not inherit "light"
    expect(prefs.getGuidePrefs()).toMatchObject({ theme: "high-contrast", variant: "signal" });
    prefs.setGuidePrefs({ theme: "blueprint", variant: "whiteprint" }); // theme and variant in one call
    expect(prefs.getGuidePrefs()).toMatchObject({ theme: "blueprint", variant: "whiteprint" });
    prefs.setGuidePrefs({ theme: "aurora" });
    expect(prefs.getGuidePrefs()).toMatchObject({ theme: "aurora", variant: "default" });
  });

  test("a variant that is not the theme's is ignored, and so is a theme that does not exist", () => {
    prefs.setGuidePrefs({ theme: "modern", variant: "light" });
    prefs.setGuidePrefs({ variant: "signal" }); // High Contrast's, not Modern's
    expect(prefs.getGuidePrefs()).toMatchObject({ theme: "modern", variant: "dark" });
    prefs.setGuidePrefs({ theme: "neon" as never });
    expect(prefs.getGuidePrefs()).toMatchObject({ theme: "modern" });
    prefs.setGuidePrefs({ theme: "pop-art", variant: "light" }); // Pop Art has no light variant
    expect(prefs.getGuidePrefs()).toMatchObject({ theme: "pop-art", variant: "sunny" });
  });

  test("a change notifies subscribers once; setting the same value does not", () => {
    let calls = 0;
    const off = prefs.subscribeGuidePrefs(() => calls++);
    const before = prefs.getGuidePrefs();
    prefs.setGuidePrefs({ theme: "high-contrast" });
    expect(calls).toBe(1);
    const after = prefs.getGuidePrefs();
    expect(after).not.toBe(before);
    prefs.setGuidePrefs({ theme: "high-contrast" });
    prefs.setGuidePrefs({ theme: "high-contrast", variant: "signal" });
    expect(calls).toBe(1);
    expect(prefs.getGuidePrefs()).toBe(after); // the snapshot React reads keeps its identity until a pref changes
    prefs.setGuidePrefs({ variant: "paper" });
    expect(calls).toBe(2);
    prefs.setGuidePrefs({ rows: "classic" });
    expect(calls).toBe(3);
    off();
    prefs.setGuidePrefs({ rows: "native" });
    expect(calls).toBe(3);
  });

  test("setting what is already set writes nothing and tells no one", () => {
    let calls = 0;
    const off = prefs.subscribeGuidePrefs(() => calls++);
    prefs.setGuidePrefs({ theme: "aurora", variant: "default", rows: "native" });
    expect(setItem).not.toHaveBeenCalled();
    expect(calls).toBe(0);
    off();
  });

  test("an invalid value is ignored, and does not stop a valid one in the same patch", () => {
    prefs.setGuidePrefs({ rows: "turbo" as never });
    prefs.setGuidePrefs({ theme: "neon" as never });
    prefs.setGuidePrefs({ art: true as never });
    prefs.setGuidePrefs({ rows: undefined });
    expect(prefs.getGuidePrefs()).toEqual(DEFAULTS);
    prefs.setGuidePrefs({ rows: "turbo" as never, theme: "risograph" });
    expect(prefs.getGuidePrefs()).toEqual({ ...DEFAULTS, theme: "risograph", variant: "flamingo" });
  });

  test("channel marks are icons until logos are chosen, and choosing them touches nothing else", () => {
    expect(prefs.getGuidePrefs().marks).toBe("icons");
    prefs.setGuidePrefs({ marks: "logos" });
    expect(prefs.getGuidePrefs()).toEqual({ ...DEFAULTS, marks: "logos" });
    prefs.setGuidePrefs({ marks: "badges" as never });
    expect(prefs.getGuidePrefs().marks).toBe("logos");
  });

  test("program art is off until it is turned on, and turning it on touches nothing else", () => {
    expect(prefs.getGuidePrefs().art).toBe("off");
    prefs.setGuidePrefs({ art: "on" });
    expect(prefs.getGuidePrefs()).toEqual({ ...DEFAULTS, art: "on" });
  });

  test("a failed write still applies the change for this session", async () => {
    setItem.mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    prefs.setGuidePrefs({ theme: "editorial" });
    await Promise.resolve();
    expect(prefs.getGuidePrefs()).toEqual({ ...DEFAULTS, theme: "editorial", variant: "newsprint" });
  });
});
