/// <reference types="bun" />
import { afterEach, describe, expect, test } from "bun:test";

import {
  getNativeGuideError,
  logGuideRenderer,
  NATIVE_GUIDE_ENABLED,
  rendererLogLine,
  rendererNote,
  reportNativeGuideError,
  resetGuideRendererLog,
  resetNativeGuideError,
  resolveGuideRenderer,
  type RendererInput,
} from "./guide-renderer";

// An Android TV build with the module, asked for the native rows, with nothing gone wrong: the one input that resolves to native.
const NATIVE: RendererInput = { enabled: true, pref: "native", platform: "android", isTV: true, nativeAvailable: true, sessionError: null };
const decide = (over: Partial<RendererInput> = {}) => resolveGuideRenderer({ ...NATIVE, ...over });

describe("resolveGuideRenderer", () => {
  test("picks the native rows only when everything allows it", () => {
    expect(decide()).toEqual({ renderer: "native", reason: "native" });
  });

  test("the kill switch turns the native rows off whatever else says", () => {
    expect(decide({ enabled: false })).toEqual({ renderer: "classic", reason: "disabled" });
  });

  test("a Classic setting keeps the classic rows", () => {
    expect(decide({ pref: "classic" })).toEqual({ renderer: "classic", reason: "pref" });
  });

  test("iOS, tvOS, iPad and Android tablets never get the native rows", () => {
    expect(decide({ platform: "ios", isTV: true })).toEqual({ renderer: "classic", reason: "platform" }); // Apple TV
    expect(decide({ platform: "ios", isTV: false })).toEqual({ renderer: "classic", reason: "platform" }); // iPad
    expect(decide({ platform: "android", isTV: false })).toEqual({ renderer: "classic", reason: "platform" }); // tablet
    expect(decide({ platform: "web", isTV: false })).toEqual({ renderer: "classic", reason: "platform" });
  });

  test("a build without the native module keeps the classic rows", () => {
    expect(decide({ nativeAvailable: false })).toEqual({ renderer: "classic", reason: "unavailable" });
  });

  test("a drawing error this session sends the guide back to the classic rows", () => {
    expect(decide({ sessionError: "boom" })).toEqual({ renderer: "classic", reason: "error" });
  });

  test("the first rule that fails names the reason", () => {
    const all: Partial<RendererInput> = { enabled: false, pref: "classic", platform: "ios", isTV: false, nativeAvailable: false, sessionError: "x" };
    expect(decide(all).reason).toBe("disabled");
    expect(decide({ ...all, enabled: true }).reason).toBe("pref");
    expect(decide({ ...all, enabled: true, pref: "native" }).reason).toBe("platform");
    expect(decide({ ...all, enabled: true, pref: "native", platform: "android", isTV: true }).reason).toBe("unavailable");
    expect(decide({ ...all, enabled: true, pref: "native", platform: "android", isTV: true, nativeAvailable: true }).reason).toBe("error");
  });

  test("the app ships with the kill switch on", () => {
    expect(NATIVE_GUIDE_ENABLED).toBe(true);
  });
});

describe("rendererNote", () => {
  test("says what the guide is using, and why when it is not what was asked for", () => {
    expect(rendererNote(decide())).toBe("Using Native.");
    expect(rendererNote(decide({ pref: "classic" }))).toBe("Using Classic.");
    expect(rendererNote(decide({ sessionError: "boom" }))).toBe("Using Classic: Native hit a problem this session and turned itself off.");
    expect(rendererNote(decide({ nativeAvailable: false }))).toBe("Using Classic: this app build doesn't include Native.");
    expect(rendererNote(decide({ platform: "ios" }))).toBe("Using Classic.");
    expect(rendererNote(decide({ enabled: false }))).toBe("Using Classic.");
  });
});

describe("the logcat line", () => {
  afterEach(resetGuideRendererLog);

  test("names the renderer and the reason for every way the choice can fall", () => {
    expect(rendererLogLine(decide())).toBe("renderer=native reason=enabled");
    expect(rendererLogLine(decide({ enabled: false }))).toBe("renderer=classic reason=kill-switch");
    expect(rendererLogLine(decide({ pref: "classic" }))).toBe("renderer=classic reason=setting-classic");
    expect(rendererLogLine(decide({ platform: "ios" }))).toBe("renderer=classic reason=not-android-tv");
    expect(rendererLogLine(decide({ nativeAvailable: false }))).toBe("renderer=classic reason=no-native-module");
    expect(rendererLogLine(decide({ sessionError: "boom" }), "boom")).toBe("renderer=classic reason=session-error detail=boom");
  });

  test("an error's detail is one short line, and only an error carries one", () => {
    const long = `bad\nthing ${"x".repeat(400)}`;
    const line = rendererLogLine(decide({ sessionError: long }), long);
    expect(line.startsWith("renderer=classic reason=session-error detail=bad thing x")).toBe(true);
    expect(line.includes("\n")).toBe(false);
    expect(line.length).toBeLessThan(220);
    expect(rendererLogLine(decide(), "ignored")).toBe("renderer=native reason=enabled");
  });

  test("a decision is logged once, and again when it changes", () => {
    const lines: string[] = [];
    const sink = (l: string) => lines.push(l);
    logGuideRenderer(decide(), null, sink);
    logGuideRenderer(decide(), null, sink); // another component asking: nothing new to say
    logGuideRenderer(decide({ pref: "classic" }), null, sink);
    logGuideRenderer(decide({ pref: "classic" }), null, sink);
    logGuideRenderer(decide(), null, sink);
    expect(lines).toEqual(["renderer=native reason=enabled", "renderer=classic reason=setting-classic", "renderer=native reason=enabled"]);
  });
});

describe("the session error", () => {
  afterEach(resetNativeGuideError);

  test("starts empty and keeps the first error for the rest of the session", () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      expect(getNativeGuideError()).toBeNull();
      reportNativeGuideError("first");
      reportNativeGuideError("second");
      expect(getNativeGuideError()).toBe("first");
      expect(decide({ sessionError: getNativeGuideError() }).reason).toBe("error");
    } finally {
      console.warn = warn;
    }
  });

  test("an empty message still counts as an error", () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      reportNativeGuideError("");
      expect(getNativeGuideError()).toBe("error");
    } finally {
      console.warn = warn;
    }
  });
});
