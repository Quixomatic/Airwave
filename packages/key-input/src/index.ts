import { requireOptionalNativeModule } from "expo";

/** A hardware key mapped to our semantic vocabulary. `digit` is -1 for non-digit keys. */
export type HardwareKeyEvent = { key: string; digit: number };

type KeyInputModule = {
  addListener: (event: "onKey", listener: (e: HardwareKeyEvent) => void) => { remove: () => void };
};

// Optional: null until the native module ships in a dev build (so JS loads fine on an older binary —
// hardware keys are simply inert until then). Android impl (onKeyDown) lands the same JS contract later.
const KeyInput = requireOptionalNativeModule<KeyInputModule>("KeyInput");

/** Subscribe to hardware key-down events. Returns a subscription; call `.remove()` to unsubscribe. */
export function addHardwareKeyListener(listener: (e: HardwareKeyEvent) => void): { remove: () => void } {
  if (!KeyInput) return { remove: () => {} };
  return KeyInput.addListener("onKey", listener);
}

/** Whether the native hardware-key module is present in this build. */
export const hasHardwareKeyInput = KeyInput != null;
