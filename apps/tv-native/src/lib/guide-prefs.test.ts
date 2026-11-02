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
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  disk.clear();
  failReads = false;
  await prefs.hydrateGuidePrefs(); // back to the defaults
});

describe("parseGuidePrefs", () => {
  test("the default is the native rows", () => {
    expect(prefs.DEFAULT_GUIDE_PREFS).toEqual({ rows: "native" });
    expect(prefs.parseGuidePrefs(null)).toEqual({ rows: "native" });
    expect(prefs.parseGuidePrefs(undefined)).toEqual({ rows: "native" });
    expect(prefs.parseGuidePrefs("")).toEqual({ rows: "native" });
  });

  test("reads a stored value", () => {
    expect(prefs.parseGuidePrefs('{"rows":"classic"}')).toEqual({ rows: "classic" });
    expect(prefs.parseGuidePrefs('{"rows":"native"}')).toEqual({ rows: "native" });
  });

  test("an unknown or invalid value falls back to the default", () => {
    expect(prefs.parseGuidePrefs('{"rows":"turbo"}')).toEqual({ rows: "native" });
    expect(prefs.parseGuidePrefs('{"rows":42}')).toEqual({ rows: "native" });
    expect(prefs.parseGuidePrefs('{"rows":null}')).toEqual({ rows: "native" });
    expect(prefs.parseGuidePrefs('{"other":"x"}')).toEqual({ rows: "native" });
  });

  test("anything that is not a JSON object falls back to the defaults", () => {
    for (const raw of ["not json", "[]", '"classic"', "7", "null", "{"]) expect(prefs.parseGuidePrefs(raw)).toEqual({ rows: "native" });
  });

  test("ignores fields it does not know", () => {
    expect(prefs.parseGuidePrefs('{"rows":"classic","theme":"dark"}')).toEqual({ rows: "classic" });
  });
});

describe("the pref store", () => {
  test("hydrates what an earlier run stored", async () => {
    disk.set(KEY, '{"rows":"classic"}');
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs()).toEqual({ rows: "classic" });
  });

  test("hydrating invalid storage leaves the defaults", async () => {
    disk.set(KEY, '{"rows":"nope"}');
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs()).toEqual({ rows: "native" });
  });

  test("a storage failure never blocks launch and leaves the defaults", async () => {
    failReads = true;
    await prefs.hydrateGuidePrefs();
    expect(prefs.getGuidePrefs()).toEqual({ rows: "native" });
  });

  test("a change persists and survives a relaunch", async () => {
    prefs.setGuidePrefs({ rows: "classic" });
    await flush();
    expect(JSON.parse(disk.get(KEY)!)).toEqual({ rows: "classic" });
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

  test("an invalid value is ignored", () => {
    prefs.setGuidePrefs({ rows: "turbo" as never });
    expect(prefs.getGuidePrefs()).toEqual({ rows: "native" });
    prefs.setGuidePrefs({ rows: undefined });
    expect(prefs.getGuidePrefs()).toEqual({ rows: "native" });
  });
});
