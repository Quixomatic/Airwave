// Exercise the production TV callback and layer stack in an isolated process. Substitute only the
// RN event source, React hook lifecycle, and optional hardware module. These are not UI focus tests.
import { mock } from "bun:test";

const platform = process.argv[2] ?? "tvos";
type Event = { eventType: string; eventKeyAction?: number; body?: { state: string } };
let receive: (e: Event) => void = () => { throw new Error("TV callback missing"); };
const cleanups: Array<() => void> = [];
Object.assign(globalThis, { __DEV__: false });
mock.module("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => void | (() => void)) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
}));
mock.module("react-native", () => ({
  Platform: { OS: platform === "android" ? "android" : "ios", isTV: platform !== "ipad" },
  useTVEventHandler: (callback: typeof receive) => { receive = callback; },
}));
mock.module("@airwave/key-input", () => ({ addHardwareKeyListener: () => ({ remove() {} }) }));

const { useTVInput, useKeyLayer, LAYER, onInputActivity } = await import("./dispatcher");
const base: string[] = [], modal: string[] = [];
let activity = 0;
onInputActivity(() => { activity++; });
useTVInput();
useKeyLayer({ id: "base", priority: LAYER.BASE, onKey: (e) => { base.push(e.key); return true; } });
for (const eventType of ["swipeUp", "swipeDown", "swipeLeft", "swipeRight"]) {
  // The pinned RN UISwipeGestureRecognizer path emits a touch event body, not eventKeyAction.
  receive({ eventType, body: { state: "Ended" } });
}
const swipes = [...base];
base.length = 0;
useKeyLayer({ id: "modal", priority: LAYER.MODAL, onKey: (e) => { modal.push(e.key); return true; } });
for (let i = 0; i < 20; i++) receive({ eventType: "swipeDown", body: { state: "Ended" } });
const underneath = [...base];
cleanups.pop()!(); // close the modal; the underlying layer resumes
for (const eventType of ["up", "down", "left", "right", "select", "menu", "playPause"]) {
  // Tap recognizers emit their completed press as keyAction=1. Do not mistake it for a duplicate release.
  receive({ eventType, eventKeyAction: 1 });
}
receive({ eventType: "longLeft", eventKeyAction: 0 });
receive({ eventType: "longLeft", eventKeyAction: 1 });
receive({ eventType: "longRight", eventKeyAction: 0 });
receive({ eventType: "longRight", eventKeyAction: 1 });
for (const eventType of ["focus", "blur", "pan", "unexpected"]) receive({ eventType });
console.log(JSON.stringify({ swipes, modal, underneath, restored: base, activity }));
