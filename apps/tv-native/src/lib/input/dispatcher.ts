import { addHardwareKeyListener } from "@ChannelGuide/key-input";
import { useEffect, useRef } from "react";
import * as RN from "react-native";

import { tvEventToKey, type KeyEvent, type SemanticKey } from "./keys";

/**
 * The input dispatcher — the RN-TV port of tv-web's `lib/input/dispatcher.ts`. Same model: a single
 * event source feeds a priority-ordered stack of layers, each declaring which keys it consumes;
 * a layer that isn't on top is never consulted. On tv-web the source is a window keydown listener;
 * here it's the TV remote via `useTVEventHandler`. Touch call sites drive the SAME state the layers
 * mutate, so the two input methods share one zone machine (exactly like the tv-web model).
 */
export const LAYER = { BASE: 0, CHROME: 100, OVERLAY: 200, MODAL: 300 } as const;

export type KeyHandler = (e: KeyEvent) => boolean | void;

type Layer = { id: string; priority: number; seq: number; onKey?: KeyHandler };

const layers: Layer[] = [];
let seqCounter = 0;

function sortLayers() {
  layers.sort((a, b) => b.priority - a.priority || b.seq - a.seq);
}

// Input-activity observers (e.g. the mini-player idle→fullscreen timer): fired on any dispatched key.
// Touch call sites (a root onTouchStart) notify via `notifyInputActivity` since touch bypasses the keys.
let activityListeners: Array<() => void> = [];
/** Notify all activity observers that the user did something (a key OR a touch). */
export function notifyInputActivity(): void {
  for (const l of [...activityListeners]) l();
}
/** Subscribe to any input activity; returns an unsubscribe. */
export function onInputActivity(cb: () => void): () => void {
  activityListeners.push(cb);
  return () => {
    activityListeners = activityListeners.filter((l) => l !== cb);
  };
}

/** Run a key through the stack top→bottom until a layer claims it (returns true). `digit` carries 0–9
 *  for a `digit` key (from the hardware-keyboard source / a future number-remote). */
export function dispatchKey(key: SemanticKey, digit?: number): boolean {
  if (key === "unknown") return false;
  notifyInputActivity();
  const e: KeyEvent = { key, digit };
  for (const layer of [...layers]) {
    if (layer.onKey?.(e) === true) return true;
  }
  return false;
}

/** Register a key layer for as long as this component is mounted and `active`. */
export function useKeyLayer(opts: { id: string; priority: number; active?: boolean; onKey?: KeyHandler }) {
  const { id, priority, active = true } = opts;
  const ref = useRef(opts.onKey);
  ref.current = opts.onKey;
  useEffect(() => {
    if (!active) return;
    const layer: Layer = { id, priority, seq: seqCounter++, onKey: (e) => ref.current?.(e) };
    layers.push(layer);
    sortLayers();
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [id, priority, active]);
}

/**
 * The TV D-pad event source — call once at the app root. `useTVEventHandler` exists ONLY in the
 * react-native-tvos build (the tvOS / Android TV targets); on the standard RN build (iPad) it's
 * undefined, so this is a no-op there and touch drives the state instead. The `if` is constant per
 * build (never toggles at runtime), so the conditional hook call is safe.
 */
export function useTVInput() {
  const RNTV = RN as unknown as {
    useTVEventHandler?: (cb: (e: { eventType: string }) => void) => void;
    TVEventControl?: { enableTVMenuKey?: () => void; disableTVMenuKey?: () => void };
  };
  const useTVEventHandler = RNTV.useTVEventHandler;
  // Enable the tvOS Menu button so it delivers a `menu` event to our dispatcher (→ `back`) for in-app
  // back navigation (close Info, close panels, dock/undock the player) instead of the OS immediately
  // backgrounding the app to Home. No-op on the iPad build. At the true guide root the guide flips this
  // back OFF via `setBackExitsApp(true)` so Back exits to Home per Apple's HIG (see below).
  useEffect(() => {
    const ctl = RNTV.TVEventControl;
    ctl?.enableTVMenuKey?.();
    return () => ctl?.disableTVMenuKey?.();
  }, [RNTV.TVEventControl]);
  if (useTVEventHandler) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTVEventHandler((e) => {
      dispatchKey(tvEventToKey(e.eventType));
    });
  }
}

// tvOS Menu-key control, cached at module load. Lets the guide flip the Menu/Back button between
// "in-app back" (enabled — the default) and "exit to the Home screen" (disabled) as the app enters or
// leaves its true root — the tvOS analogue of tv-web's `platformBack()`. On tvOS, the OS only exits the
// app when the Menu key is NOT captured, so a one-press root exit requires disabling it *before* the
// press, i.e. reactively as the app reaches root. No-op off tvOS (TVEventControl is undefined on
// iPad/Android — there Back is a hardware key handled by `useAndroidBack`, and iPad has no Back at all).
const TV_MENU_CTL = (RN as unknown as {
  TVEventControl?: { enableTVMenuKey?: () => void; disableTVMenuKey?: () => void };
}).TVEventControl;

/** At the true root (nothing in-app left to go back to), disable the Menu key so tvOS backgrounds the
 *  app to Home on Back; otherwise keep it enabled so Back navigates in-app. Call reactively from the
 *  screen that owns the root (the guide). No-op off tvOS. */
export function setBackExitsApp(atRoot: boolean): void {
  if (!TV_MENU_CTL) return;
  if (atRoot) TV_MENU_CTL.disableTVMenuKey?.();
  else TV_MENU_CTL.enableTVMenuKey?.();
}

/**
 * The HARDWARE-KEYBOARD event source (`@ChannelGuide/key-input`) — call once at the app root alongside
 * `useTVInput`. On iPad/tvOS it reads GCKeyboard (a Magic Keyboard, any BT keyboard, a keyboard-equipped
 * remote) and feeds the SAME dispatcher, so the D-pad zone machine + channel-number entry are finally
 * drivable on a device with no TV remote. The native layer already maps to our vocabulary
 * (up/down/left/right/ok/back/chUp/chDown/digit); here we just forward it. No-op if the native module
 * isn't in the build yet (older binary). Android/Fire TV get the same contract via `onKeyDown` later.
 */
export function useHardwareKeyInput() {
  useEffect(() => {
    const sub = addHardwareKeyListener((e) => {
      dispatchKey(e.key as SemanticKey, e.digit >= 0 ? e.digit : undefined);
    });
    return () => sub.remove();
  }, []);
}

/**
 * The Android hardware-BACK source — call once at the app root. On Android the remote's Back button is
 * NOT reliably delivered via `dispatchKeyEvent` (modern Android routes it through the predictive-back
 * dispatcher), so unlike the D-pad it's caught here via RN's `BackHandler`. Because `dispatchKey`
 * returns synchronously whether a layer claimed the key, we can honor Android's contract exactly:
 * return `true` to consume Back as in-app navigation (close Info / panel / go back a screen), or `false`
 * when nothing claims it (the guide root) so RN performs the default action and the app exits to the
 * launcher — the real "regular Back button" behavior. Android-only: iOS has no hardware Back, and tvOS
 * delivers Menu→`back` through `useTVEventHandler` already (registering here would double-fire it).
 */
export function useAndroidBack() {
  useEffect(() => {
    if (RN.Platform.OS !== "android") return;
    const sub = RN.BackHandler.addEventListener("hardwareBackPress", () => dispatchKey("back"));
    return () => sub.remove();
  }, []);
}
