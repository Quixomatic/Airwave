import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

/**
 * How the channel guide looks and draws on this device. A per-device preference, stored as one JSON value in
 * AsyncStorage and hydrated once at launch into a module variable so `getGuidePrefs()` is synchronous (the same pattern as
 * `audio-pref.ts`). A small external store notifies the guide and the settings page when it changes.
 *
 *  - `rows`: "native" (the default) draws the guide's rows in one native view, on Android TV and only when the app build
 *    has the native module; the guide falls back to classic by itself when anything goes wrong (see
 *    `features/guide/guide-renderer.ts`). "classic" draws them as React Native views, which is what every other platform
 *    always does. Settings -> Guide -> Guide rendering shows them as Native and Classic.
 */
export type GuideRows = "classic" | "native";

export type GuidePrefs = {
  rows: GuideRows;
};

export const DEFAULT_GUIDE_PREFS: GuidePrefs = { rows: "native" };

const KEY = "cg-guide-prefs";

/** One validator per field: a stored value it doesn't accept falls back to the field's default. */
const VALID: { [K in keyof GuidePrefs]: (v: unknown) => v is GuidePrefs[K] } = {
  rows: (v): v is GuideRows => v === "classic" || v === "native",
};
const FIELDS = Object.keys(VALID) as (keyof GuidePrefs)[];

/** The prefs a stored string describes. Anything missing, unknown, or not JSON at all is replaced by its default. */
export function parseGuidePrefs(raw: string | null | undefined): GuidePrefs {
  let stored: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: use the defaults.
  }
  const out: Record<string, unknown> = { ...DEFAULT_GUIDE_PREFS };
  for (const k of FIELDS) if (VALID[k](stored[k])) out[k] = stored[k];
  return out as GuidePrefs;
}

let _prefs: GuidePrefs = DEFAULT_GUIDE_PREFS;
const listeners = new Set<() => void>();

/** Seed the in-memory prefs from AsyncStorage. Awaited at launch (alongside loadSession/loadDevice). Never throws: a
 *  storage failure leaves the defaults. */
export async function hydrateGuidePrefs(): Promise<void> {
  try {
    _prefs = parseGuidePrefs(await AsyncStorage.getItem(KEY));
  } catch {
    _prefs = DEFAULT_GUIDE_PREFS;
  }
}

export function getGuidePrefs(): GuidePrefs {
  return _prefs;
}

/** Change some prefs: persists them and notifies subscribers. A value the field doesn't accept is ignored. */
export function setGuidePrefs(patch: Partial<GuidePrefs>): void {
  const merged: Record<string, unknown> = { ..._prefs };
  for (const k of FIELDS) if (patch[k] !== undefined && VALID[k](patch[k])) merged[k] = patch[k];
  const next = merged as GuidePrefs;
  if (FIELDS.every((k) => next[k] === _prefs[k])) return;
  _prefs = next;
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  for (const l of listeners) l();
}

/** Calls `cb` after every change to the prefs. Returns the unsubscribe function. */
export function subscribeGuidePrefs(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Reactive read for React components. The snapshot only changes identity when a pref does. */
export function useGuidePrefs(): GuidePrefs {
  return useSyncExternalStore(subscribeGuidePrefs, getGuidePrefs);
}
