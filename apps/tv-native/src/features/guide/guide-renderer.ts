import { useSyncExternalStore } from "react";

import type { GuideRows } from "@/lib/guide-prefs";

/**
 * Which renderer draws the guide's rows: the React Native rows ("classic", Classic in Settings) or the native view
 * ("native", Native in Settings, the default on Android TV). `resolveGuideRenderer` is the one place that decides; it picks
 * native only where the native rows are supported and wanted, and everything else gets the React Native rows.
 *
 * Kept free of react-native imports so `bun test` can load it: the platform and the module's presence come in as inputs
 * (use-guide-renderer.ts supplies them).
 */

/** App-wide kill switch: `false` turns the native rows off everywhere (every guide draws the React Native rows, and
 *  Settings hides the choice), whatever the setting or the device. */
export const NATIVE_GUIDE_ENABLED = true;

export type RendererReason =
  /** The native rows draw this guide. */
  | "native"
  /** The kill switch is off. */
  | "disabled"
  /** Settings -> Guide -> Guide rendering is Classic. */
  | "pref"
  /** Not Android TV (Apple TV, iPad, Android tablets). */
  | "platform"
  /** This app build has no native guide module (an over-the-air JS update on an older APK). */
  | "unavailable"
  /** The native view reported a drawing error this session. */
  | "error";

export type RendererInput = {
  enabled: boolean;
  pref: GuideRows;
  /** Platform.OS */
  platform: string;
  /** Platform.isTV */
  isTV: boolean;
  nativeAvailable: boolean;
  /** A drawing error the native view reported this session (null: none). */
  sessionError: string | null;
};

export type RendererDecision = { renderer: GuideRows; reason: RendererReason };

/** Which renderer draws the guide's rows. The first match wins; anything but the last line is the React Native rows. */
export function resolveGuideRenderer(i: RendererInput): RendererDecision {
  const classic = (reason: RendererReason): RendererDecision => ({ renderer: "classic", reason });
  if (!i.enabled) return classic("disabled");
  if (i.pref === "classic") return classic("pref");
  if (i.platform !== "android" || !i.isTV) return classic("platform");
  if (!i.nativeAvailable) return classic("unavailable");
  if (i.sessionError) return classic("error");
  return { renderer: "native", reason: "native" };
}

/** The status line under the Guide rendering setting: what the guide is using, and why when it isn't what was asked for. */
export function rendererNote(d: RendererDecision): string {
  switch (d.reason) {
    case "native":
      return "Using Native.";
    case "error":
      return "Using Classic: Native hit a problem this session and turned itself off.";
    case "unavailable":
      return "Using Classic: this app build doesn't include Native.";
    case "pref":
    case "platform":
    case "disabled":
      return "Using Classic.";
  }
}

/** Why, in the words of the logcat line (tag AirwaveGuide). Every reason has one, so a bug report can say what the app chose. */
const REASON_LOG: Record<RendererReason, string> = {
  native: "enabled",
  disabled: "kill-switch",
  pref: "setting-classic",
  platform: "not-android-tv",
  unavailable: "no-native-module",
  error: "session-error",
};

/**
 * The one line that says which renderer draws the guide and why, e.g. `renderer=native reason=enabled` or
 * `renderer=classic reason=session-error detail=...`. `detail` is the drawing error that sent the guide back to the classic
 * rows, cut to one short line.
 */
export function rendererLogLine(d: RendererDecision, detail: string | null = null): string {
  const base = `renderer=${d.renderer} reason=${REASON_LOG[d.reason]}`;
  return d.reason === "error" && detail ? `${base} detail=${detail.replace(/\s+/g, " ").slice(0, 160)}` : base;
}

let lastLogged: string | null = null;

/** Hands `sink` the line for `d`, once: a decision that has not changed since the last call (every component that asks
 *  which renderer is in use runs this) is dropped, and a change of renderer or reason logs again. */
export function logGuideRenderer(d: RendererDecision, detail: string | null, sink: (line: string) => void): void {
  const line = rendererLogLine(d, detail);
  if (line === lastLogged) return;
  lastLogged = line;
  sink(line);
}

/** For tests: forget the last logged line. */
export function resetGuideRendererLog(): void {
  lastLogged = null;
}

// A drawing error from the native view stays for the rest of the app run: the guide keeps the React Native rows until
// the app restarts (the setting itself isn't changed).
let sessionError: string | null = null;
const listeners = new Set<() => void>();

/** The native view (or the lineup handover) failed: switch the guide to the React Native rows for this session. */
export function reportNativeGuideError(message: string): void {
  if (sessionError) return;
  sessionError = message || "error";
  console.warn(`[guide] native rows failed, using the classic rows for this session: ${sessionError}`);
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getNativeGuideError(): string | null {
  return sessionError;
}

export function useNativeGuideError(): string | null {
  return useSyncExternalStore(subscribe, getNativeGuideError);
}

/** For tests: forget a reported error. */
export function resetNativeGuideError(): void {
  sessionError = null;
}
