import { useEffect, useState } from "react";

import { LAYER, useKeyLayer } from "./dispatcher";

/**
 * D-pad navigation over a flat list of focusable items — the small, declarative case that most
 * screens actually need (login's two buttons, the diagnostic's Continue, the setup screen's
 * input + buttons).
 *
 * Screens used to get D-pad support only if their author remembered to hand-roll a `window`
 * listener — so login, server setup, the diagnostic and the key probe simply never got it and were
 * reachable ONLY by the magic-remote pointer. With this, a screen declares how many items it has
 * and what OK does, and it's navigable.
 *
 * Focus here is simulated (an index you render as a ring), matching the rest of the app — EXCEPT
 * where a screen needs real DOM focus for a text field, which it manages itself via `claimOk`.
 */
export function useDpadList(opts: {
  id: string;
  count: number;
  onActivate: (i: number) => void;
  /** Return true to consume Back; omit to let it fall through to a lower layer. */
  onBack?: () => boolean | void;
  active?: boolean;
  priority?: number;
  /** `horizontal` swaps which arrows move the cursor. */
  orientation?: "vertical" | "horizontal";
  /**
   * Set false while a real DOM-focused control (a text input) should receive OK itself — the
   * layer then declines OK so the browser fires the native keypress/click.
   */
  claimOk?: boolean;
  /** Start the cursor somewhere other than 0. */
  initial?: number;
}) {
  const {
    id,
    count,
    active = true,
    priority = LAYER.BASE,
    orientation = "vertical",
    claimOk = true,
    initial = 0,
  } = opts;
  const [sel, setSel] = useState(initial);

  // Keep the cursor in range when the item count shrinks under it (e.g. a scan result list
  // is replaced by a shorter one).
  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, count - 1)));
  }, [count]);

  const prevKey = orientation === "vertical" ? "up" : "left";
  const nextKey = orientation === "vertical" ? "down" : "right";

  useKeyLayer({
    id,
    priority,
    active,
    onKey(e) {
      if (e.key === "back") {
        return opts.onBack?.() === true;
      }
      if (e.key === prevKey) {
        setSel((s) => Math.max(0, s - 1));
        return true;
      }
      if (e.key === nextKey) {
        setSel((s) => Math.min(Math.max(0, count - 1), s + 1));
        return true;
      }
      if (e.key === "ok" && claimOk) {
        opts.onActivate(sel);
        return true;
      }
      return false;
    },
  });

  return { sel, setSel };
}
