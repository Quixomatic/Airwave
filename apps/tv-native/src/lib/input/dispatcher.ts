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

/** Run a key through the stack top→bottom until a layer claims it (returns true). */
export function dispatchKey(key: SemanticKey): boolean {
  if (key === "unknown") return false;
  const e: KeyEvent = { key };
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
  const useTVEventHandler = (RN as unknown as { useTVEventHandler?: (cb: (e: { eventType: string }) => void) => void }).useTVEventHandler;
  if (useTVEventHandler) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useTVEventHandler((e) => {
      dispatchKey(tvEventToKey(e.eventType));
    });
  }
}
