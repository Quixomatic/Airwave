import { useEffect, useRef } from "react";

import { physicalId, toKeyEvent, type KeyEvent } from "./keys";

/**
 * THE input dispatcher — one `window` keydown listener for the whole app, routing each press to a
 * priority-ordered stack of layers.
 *
 * ## Why
 * Before this, ~10 components each added their own `window` listener. Since sibling listeners on
 * the same target fire in registration order and can't be reordered, every handler had to
 * defensively guess whether it was currently "in charge" — via shared mutex refs
 * (`numberEntryActiveRef`, `surfActiveRef`), `layout === "full"` early-returns, capture-vs-bubble
 * tricks, and `stopImmediatePropagation` to shout the others down. Six different conflict
 * mechanisms for one problem, and every new mode had to be taught to every existing handler.
 *
 * With a single listener, "who handles this key" stops being a race and becomes a lookup. A layer
 * that isn't on top simply never gets called — so the guards don't move, they cease to exist.
 *
 * ## Modes
 * - `transparent` (default) — consume what you claim; anything you don't claim falls through to
 *   the layer beneath. The common case (guide, settings, player chrome).
 * - `exclusive` — consume what you claim and SWALLOW the rest. A modal that must not leak keys
 *   downward (channel surf deliberately eats ▲▼ so they don't reach the chrome).
 * - `passive` — observe every key, never consume, always fall through. For side-effects like
 *   "reset the auto-hide timer on any press".
 *
 * ## Pause is a semaphore, not a boolean
 * Deliberate: Enact's Spotlight documents `Pause` as a semaphore precisely because a boolean
 * breaks when two things (say a transition AND a modal) both want input halted and the first one
 * to resume clobbers the other. `pauseInput()` returns its own release function; input resumes
 * only when every holder has released.
 */

export const LAYER = {
  /** Screens: guide, settings content, login, setup, diagnostic. */
  BASE: 0,
  /** Player chrome + feature panel — sits over a screen. */
  CHROME: 100,
  /** Full-screen overlays like channel surf. */
  OVERLAY: 200,
  /** Modals that own the keys outright: number entry, the key probe. */
  MODAL: 300,
} as const;

export type LayerMode = "transparent" | "exclusive" | "passive";

/** Return `true` from a handler to claim the key (dispatcher then preventDefaults + stops it). */
export type KeyHandler = (e: KeyEvent) => boolean | void;

type Layer = {
  id: string;
  priority: number;
  /** Registration order — later mounts win ties, matching "the thing opened last is on top". */
  seq: number;
  mode: LayerMode;
  onKey?: KeyHandler;
  onKeyUp?: KeyHandler;
};

const layers: Layer[] = [];
let seqCounter = 0;
let pauseCount = 0;
let installed = false;

/** Physical keys currently held — our own repeat detection (`e.repeat` is unreliable on TV). */
const pressed = new Set<string>();

/** Root-level interceptor: sees every key BEFORE any layer. Return true to consume. */
let interceptor: KeyHandler | null = null;

/** Highest priority first; within a priority, most-recently-registered first. */
function sortLayers() {
  layers.sort((a, b) => b.priority - a.priority || b.seq - a.seq);
}

function consume(raw: KeyboardEvent) {
  raw.preventDefault();
  raw.stopPropagation();
}

function run(e: KeyEvent, pick: (l: Layer) => KeyHandler | undefined): void {
  if (interceptor?.(e) === true) {
    consume(e.raw);
    return;
  }
  // Iterate a snapshot: a handler may push/pop layers (e.g. opening a modal) mid-dispatch.
  for (const layer of [...layers]) {
    const handler = pick(layer);
    if (layer.mode === "passive") {
      handler?.(e);
      continue;
    }
    if (handler?.(e) === true) {
      consume(e.raw);
      return;
    }
    // An exclusive layer absorbs everything it didn't explicitly claim, rather than leaking it
    // to the screen underneath.
    if (layer.mode === "exclusive") {
      consume(e.raw);
      return;
    }
  }
}

function onKeyDown(raw: KeyboardEvent) {
  const id = physicalId(raw);
  const repeat = pressed.has(id);
  pressed.add(id);
  if (pauseCount > 0) return;
  run(toKeyEvent(raw, repeat), (l) => l.onKey);
}

function onKeyUp(raw: KeyboardEvent) {
  pressed.delete(physicalId(raw));
  if (pauseCount > 0) return;
  run(toKeyEvent(raw, false), (l) => l.onKeyUp);
}

/** Installed lazily on first registration; capture phase so we see keys before any element. */
function install() {
  if (installed) return;
  installed = true;
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  // The app never unmounts, so there's deliberately no uninstall.
}

function registerLayer(layer: Omit<Layer, "seq">): () => void {
  install();
  const entry: Layer = { ...layer, seq: seqCounter++ };
  layers.push(entry);
  sortLayers();
  return () => {
    const i = layers.indexOf(entry);
    if (i >= 0) layers.splice(i, 1);
  };
}

/**
 * Halt ALL input until the returned function is called. Counted — nested pauses each need their
 * own release, so one holder resuming can't unblock another's.
 */
export function pauseInput(): () => void {
  pauseCount++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pauseCount = Math.max(0, pauseCount - 1);
  };
}

/**
 * Register a key layer for as long as this component is mounted and `active`.
 *
 * The handler is held in a ref, so it can close over fresh state every render WITHOUT
 * re-registering the layer — that's what keeps registration order (and therefore tie-breaking)
 * stable even for a component whose handler has a dozen dependencies.
 */
export function useKeyLayer(opts: {
  id: string;
  priority: number;
  /** Defaults to true. When false the layer is off the stack entirely. */
  active?: boolean;
  mode?: LayerMode;
  onKey?: KeyHandler;
  onKeyUp?: KeyHandler;
}) {
  const { id, priority, active = true, mode = "transparent" } = opts;
  const onKeyRef = useRef(opts.onKey);
  onKeyRef.current = opts.onKey;
  const onKeyUpRef = useRef(opts.onKeyUp);
  onKeyUpRef.current = opts.onKeyUp;

  useEffect(() => {
    if (!active) return;
    return registerLayer({
      id,
      priority,
      mode,
      onKey: (e) => onKeyRef.current?.(e),
      onKeyUp: (e) => onKeyUpRef.current?.(e),
    });
  }, [id, priority, mode, active]);
}

/**
 * The root interceptor — sees every key before any layer. Exactly one may be installed; it's for
 * genuinely global concerns (app exit), not screen behavior.
 */
export function useKeyInterceptor(handler: KeyHandler, active = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return;
    install();
    interceptor = (e) => ref.current(e);
    return () => {
      interceptor = null;
    };
  }, [active]);
}

/** Debug helper — the current stack, top first. */
export function inputStack(): { id: string; priority: number; mode: LayerMode }[] {
  return layers.map((l) => ({ id: l.id, priority: l.priority, mode: l.mode }));
}
