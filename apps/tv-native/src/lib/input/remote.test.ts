import { describe, expect, test } from "bun:test";
import { tvEventToKey } from "./keys";

const directions = [["swipeUp", "up"], ["swipeDown", "down"], ["swipeLeft", "left"], ["swipeRight", "right"]] as const;

describe("Apple TV remote swipe translation", () => {
  for (const [event, key] of directions) {
    test(`${event} navigates on Apple TV`, () => {
      expect(tvEventToKey(event, true)).toBe(key);
    });
    test(`${event} is ignored outside Apple TV`, () => {
      expect(tvEventToKey(event, false)).toBe("unknown");
    });
  }
  test("existing buttons and unknown/focus/pan events keep their mappings", () => {
    const cases = { up: "up", down: "down", left: "left", right: "right", select: "ok",
      longSelect: "okLong", menu: "back", playPause: "playPause", focus: "unknown",
      blur: "unknown", pan: "unknown", unexpected: "unknown" } as const;
    for (const [event, key] of Object.entries(cases)) {
      expect(tvEventToKey(event)).toBe(key);
      expect(tvEventToKey(event, true)).toBe(key);
    }
  });
});

for (const platform of ["tvos", "android", "ipad"]) {
  test(`${platform}: production TV callback routes once through the active layer and restores after modal cleanup`, () => {
    const process = Bun.spawnSync([Bun.which("bun")!, `${import.meta.dir}/remote-test-worker.ts`, platform]);
    if (process.exitCode !== 0) throw new Error(process.stderr.toString());
    const result = JSON.parse(process.stdout.toString());
    expect(result.swipes).toEqual(platform === "tvos" ? ["up", "down", "left", "right"] : []);
    expect(result.modal).toEqual(platform === "tvos" ? Array(20).fill("down") : []);
    expect(result.underneath).toEqual([]);
    expect(result.restored).toEqual(["up", "down", "left", "right", "ok", "back", "playPause",
      "leftHold", "holdEnd", "rightHold", "holdEnd"]);
    expect(result.activity).toBe(platform === "tvos" ? 35 : 11);
  });
}
