import { nativeGuide, nativeGuideAvailable } from "@airwave/native-guide";
import { useEffect } from "react";
import { Platform } from "react-native";

import { useGuidePrefs } from "@/lib/guide-prefs";

import { logGuideRenderer, NATIVE_GUIDE_ENABLED, resolveGuideRenderer, type RendererDecision, useNativeGuideError } from "./guide-renderer";

/** One line to logcat under the tag AirwaveGuide, through the native module. A build without the module (or an older one that
 *  has no `logRenderer`) and every other platform log it with the JS console instead. */
function logLine(line: string): void {
  try {
    if (nativeGuide && typeof nativeGuide.logRenderer === "function") {
      nativeGuide.logRenderer(line);
      return;
    }
  } catch {
    // Fall through to the console.
  }
  console.info(`[AirwaveGuide] ${line}`);
}

/**
 * Which renderer draws the guide's rows right now: the setting, this device and build, and any error this session. Every
 * change of the answer is logged once, as a logcat line saying which renderer and why (see `rendererLogLine`).
 */
export function useGuideRenderer(): RendererDecision {
  const prefs = useGuidePrefs();
  const sessionError = useNativeGuideError();
  const decision = resolveGuideRenderer({
    enabled: NATIVE_GUIDE_ENABLED,
    pref: prefs.rows,
    platform: Platform.OS,
    isTV: Platform.isTV,
    nativeAvailable: nativeGuideAvailable(),
    sessionError,
  });
  useEffect(() => {
    logGuideRenderer(decision, sessionError, logLine);
  }, [decision.renderer, decision.reason, sessionError]);
  return decision;
}

/** Settings offers the Guide rendering choice only where there is one to make: an Android TV build that has the module. */
export const GUIDE_ROWS_SETTING = NATIVE_GUIDE_ENABLED && Platform.OS === "android" && Platform.isTV && nativeGuideAvailable();
