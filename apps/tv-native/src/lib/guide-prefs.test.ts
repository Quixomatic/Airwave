/// <reference types="bun" />
import { beforeEach, describe, expect, mock, test } from "bun:test";

// AsyncStorage is native: stand in for it with a map, so the store's hydrate / persist round trip runs for real.
const disk = new Map<string, string>();
let failReads = false;
mock.module("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => {
      if (failReads) throw new Error("storage unavailable");
      return disk.get(k) ?? null;
    },
    setItem: async (k: string, v: string) => void disk.set(k, v),
  },
}));

const prefs = await import("./guide-prefs");

const KEY = "cg-guide-prefs";
const DEFAULTS = { marks: "icons", art: "off", rows: "native" } as const;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  disk.clear();
  failReads = false;
  await prefs.hydrateGuidePrefs(); // back to the defaults
});

describe("parseGuidePrefs", () => {
  test("the defaults are icons, no program art and the native rows", () => {
    expect(prefs.DEFAULT_GUIDE_PREFS).toEqual(DEFAULTS);
    expect(prefs.parseGuidePrefs(null)).toEqual(DEFAULTS);
    expect(prefs.parseGuidePrefs(undefined)).toEqual(DEFAULTS);
    expect(prefs.parseGuidePrefs("")).toEqual(DEFAULTS);
  });

  test("reads a stored value", () => {
    expect(prefs.parseGuidePrefs('{"rows":"classic"}')).toEqual({ ...DEFAULTS, rows: "classic" });
    expect(prefs.parseGuidePrefs('{"rows":"native"}')).toEqual(DEFAULTS);
    expect(prefs.parseGuidePrefs('{"art":"on"}')).toEqual({ ...DEFAULTS, art: "on" });
    expect(prefs.parseGuidePrefs('{"marks":"logos"}')).toEqual({ ...DEFAULTS, marks: "logos" });
  });

  test("an unknown or invalid value falls back to the default", () => {
    expect(prefs.parseGuidePrefs('{"rows":"turbo"}')).toEqual(DEFAULTS);
    expect(prefs.parseGuidePrefs('{"rows":42}')).toEqual(DEFAULTS);
    expect(prefs.parseGuidePrefs('{"rows":null}')).toEqual(DEFAULTS);
    for (const bad of ['{"art":true}', '{"art":"yes"}', '{"art":1}', '{"art":null}', '{"marks":"logo"}', '{"marks":true}']) expect(prefs.parseGuidePrefs(bad)).toEqual(DEFAULTS);
    expect(prefs.parseGuidePrefs('{"rows":"turbo","art":"on"}')).toEqual({ ...DEFAULTS, art: "on" }); // each field on its own
    expect(prefs.parseGuidePrefs('{"other":"x"}')).toEqual(DEFAULTS);
  });

  test("anything that is not a JSON object falls back to the defaults", () => {
    for (const raw of ["not json", "[]", '"native"', "7", "null", "{"]) expect(prefs.parseGuidePrefs(raw)).toEqual(DEFAULTS);
  });

  test("ignores fields it does not know", () => {
    expect(prefs.parseGuidePrefs('{"rows":"classic","theme":"dark"}')).toEqual({ ...DEFAULTS, rows: "classic" });
  });
});

describe("the pref store", () => {
  test("hydrates what an earlier run stored", async () => {
    disk.set(KEY, '{"rows":"classic"}');
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs()).toEqual({ ...DEFAULTS, rows: "classic" });
  });

  test("hydrating invalid storage leaves the defaults", async () => {
    disk.set(KEY, '{"rows":"nope"}');
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs()).toEqual(DEFAULTS);
  });

  test("a storage failure never blocks launch and leaves the defaults", async () => {
    failReads = true;
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs()).toEqual(DEFAULTS);
  });

  test("a change persists and survives a relaunch", async () => {
    prefs.setGuidePrefs({ rows: "classic" });
    await flush();
    expect(JSON.parse(disk.get(KEY)!)).toEqual({ marks: "icons", art: "off", rows: "classic" });
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs().rows).toBe("classic");
  });

  test("a change notifies subscribers; setting the same value does not", () => {
    let calls = 0;
    const off = prefs.subscribeGuidePrefs(() => calls++);
    const before = prefs.getGuidePrefs();
    prefs.setGuidePrefs({ rows: "classic" });
    expect(calls).toBe(1);
    const after = prefs.getGuidePrefs();
    expect(after).not.toBe(before);
    prefs.setGuidePrefs({ rows: "classic" });
    expect(calls).toBe(1);
    expect(prefs.getGuidePrefs()).toBe(after); // the snapshot React reads keeps its identity until a pref changes
    prefs.setGuidePrefs({ rows: "native" });
    expect(calls).toBe(2);
    off();
    prefs.setGuidePrefs({ rows: "classic" });
    expect(calls).toBe(2);
  });

  test("channel marks are icons until logos are chosen, and choosing them touches nothing else", () => {
    expect(prefs.getGuidePrefs().marks).toBe("icons");
    prefs.setGuidePrefs({ marks: "logos" });
    expect(prefs.getGuidePrefs()).toEqual({ ...DEFAULTS, marks: "logos" });
    prefs.setGuidePrefs({ marks: "badges" as never });
    expect(prefs.getGuidePrefs().marks).toBe("logos");
  });

  test("program art is off until it is turned on, and turning it on touches nothing else", async () => {
    expect(prefs.getGuidePrefs().art).toBe("off");
    prefs.setGuidePrefs({ art: "on" });
    await flush();
    expect(prefs.getGuidePrefs()).toEqual({ ...DEFAULTS, art: "on" });
    expect(JSON.parse(disk.get(KEY)!)).toEqual({ marks: "icons", art: "on", rows: "native" });
    prefs.setGuidePrefs({ art: true as never });
    expect(prefs.getGuidePrefs().art).toBe("on");
  });

  test("an invalid value is ignored", () => {
    prefs.setGuidePrefs({ rows: "turbo" as never });
    expect(prefs.getGuidePrefs()).toEqual(DEFAULTS);
    prefs.setGuidePrefs({ rows: undefined });
    expect(prefs.getGuidePrefs()).toEqual(DEFAULTS);
  });
});
