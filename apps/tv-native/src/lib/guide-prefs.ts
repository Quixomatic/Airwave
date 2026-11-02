import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { DEFAULT_GUIDE_THEME, DEFAULT_GUIDE_VARIANT, findGuideTheme, type GuideThemeId, isGuideThemeId, isGuideVariantId } from "@/features/guide/guide-themes";

/**
 * How the channel guide looks and draws on this device. A per-device preference, stored as one JSON value in
 * AsyncStorage and hydrated once at launch into a module variable so `getGuidePrefs()` is synchronous (the same pattern as
 * `audio-pref.ts`). A small external store notifies the guide and the settings page when it changes.
 *
 *  - `theme` and `variant`: which look the guide screen is painted in (Settings -> Guide), and which of the theme's color
 *    variants. Aurora is the standard look and has one variant, "default". A variant that is not one of the theme's (another
 *    theme's, or one a later version dropped) is the theme's default variant, so the pair is always a look that exists.
 *  - `marks`: "icons" (the default) shows each channel's icon in a colored circle. "logos" shows a channel's logo where one is
 *    set (the admin gives a channel a logo address) and keeps the icon for the rest, and for a logo that fails to load.
 *  - `art`: "off" (the default) draws plain program cells; "on" draws each program's artwork behind its title (served by
 *    the server's image route, sized to the cell). It costs memory and network, which is why it is opt-in.
 *  - `rows`: "native" (the default) draws the guide's rows in one native view, on Android TV and only when the app build
 *    has the native module; the guide falls back to classic by itself when anything goes wrong (see
 *    `features/guide/guide-renderer.ts`). "classic" draws them as React Native views, which is what every other platform
 *    always does. Settings -> Guide -> Guide rendering shows them as Native and Classic.
 *
 * Whatever is stored is read field by field and anything missing or invalid falls back to its default, so a damaged or
 * older value can never leave the guide unstyled.
 */
export type GuideRows = "classic" | "native";
export type GuideArt = "off" | "on";
export type GuideMarks = "icons" | "logos";

export type GuidePrefs = {
  theme: GuideThemeId;
  variant: string;
  marks: GuideMarks;
  art: GuideArt;
  rows: GuideRows;
};

export const DEFAULT_GUIDE_PREFS: GuidePrefs = { theme: DEFAULT_GUIDE_THEME, variant: DEFAULT_GUIDE_VARIANT, marks: "icons", art: "off", rows: "native" };

export const GUIDE_PREFS_KEY = "cg-guide-prefs";

/** One validator per field: a stored value it doesn't accept falls back to the field's default. */
const VALID: { [K in keyof GuidePrefs]: (v: unknown) => v is GuidePrefs[K] } = {
  theme: isGuideThemeId,
  variant: (v): v is string => typeof v === "string" && v.length > 0,
  marks: (v): v is GuideMarks => v === "icons" || v === "logos",
  art: (v): v is GuideArt => v === "off" || v === "on",
  rows: (v): v is GuideRows => v === "classic" || v === "native",
};
const FIELDS = Object.keys(VALID) as (keyof GuidePrefs)[];

/** `prefs` with a variant that is one of its theme's: the theme's default variant where it is not. */
function withValidVariant(prefs: GuidePrefs): GuidePrefs {
  return isGuideVariantId(prefs.theme, prefs.variant) ? prefs : { ...prefs, variant: findGuideTheme(prefs.theme).defaultVariant };
}

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
  return withValidVariant(out as GuidePrefs);
}

let _prefs: GuidePrefs = DEFAULT_GUIDE_PREFS;
const listeners = new Set<() => void>();

/** Seed the in-memory prefs from AsyncStorage. Awaited at launch (alongside loadSession/loadDevice). Never throws: a
 *  storage failure leaves what the store already holds (the defaults, at launch). */
export async function hydrateGuidePrefs(): Promise<void> {
  try {
    _prefs = parseGuidePrefs(await AsyncStorage.getItem(GUIDE_PREFS_KEY));
  } catch {
    // Storage unreadable: keep what we have.
  }
}

export function getGuidePrefs(): GuidePrefs {
  return _prefs;
}

/** Change some prefs: persists them and notifies subscribers. A value the field doesn't accept is ignored, and a change
 *  that alters nothing does neither. Choosing another theme without a variant gives that theme's default variant. */
export function setGuidePrefs(patch: Partial<GuidePrefs>): void {
  const merged: Record<string, unknown> = { ..._prefs };
  for (const k of FIELDS) if (patch[k] !== undefined && VALID[k](patch[k])) merged[k] = patch[k];
  // A new theme starts on its own default variant, unless the same call says which.
  if (merged.theme !== _prefs.theme && !(patch.variant !== undefined && VALID.variant(patch.variant))) merged.variant = findGuideTheme(merged.theme).defaultVariant;
  const next = withValidVariant(merged as GuidePrefs);
  if (FIELDS.every((k) => next[k] === _prefs[k])) return;
  _prefs = next;
  void AsyncStorage.setItem(GUIDE_PREFS_KEY, JSON.stringify(next)).catch(() => {});
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
