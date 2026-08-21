import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";

import { isFullscreen, toggleFullscreen } from "./fullscreen";

/**
 * Fullscreen state + behavior for the whole app (mounted once, in the TitleBar):
 *  - tracks `full` (synced from the window, so it reflects our button, F11, and OS-driven changes),
 *  - reflects it in the DOM: `html.fs` hides the custom titlebar and fills the content to the top
 *    edge (`--content-top: 0`); moving the mouse to the very top edge adds `html.fs-peek` to reveal
 *    the titlebar (the standard fullscreen menu-bar reveal),
 *  - binds **F11** anywhere to toggle.
 */
const win = getCurrentWindow();

export function useFullscreen() {
  const [full, setFull] = useState(false);

  // Keep `full` in sync with the real window state. Entering/leaving fullscreen fires a resize, so
  // re-reading on resize also covers F11 and any OS-initiated change (e.g. macOS gesture).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void isFullscreen().then(setFull);
    void win.onResized(() => void isFullscreen().then(setFull)).then((u) => {
      unlisten = u;
    });
    return () => unlisten?.();
  }, []);

  // Reflect fullscreen in the DOM (hide the titlebar + fill to the top; peek the titlebar on hover
  // at the very top edge).
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("fs", full);
    if (!full) {
      el.classList.remove("fs-peek");
      return;
    }
    let hideTimer = 0;
    const onMove = (e: MouseEvent) => {
      if (e.clientY <= 4) {
        window.clearTimeout(hideTimer);
        el.classList.add("fs-peek");
      } else if (e.clientY > 48) {
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => el.classList.remove("fs-peek"), 400);
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.clearTimeout(hideTimer);
    };
  }, [full]);

  // F11 toggles fullscreen from anywhere (outside the app's semantic-key dispatcher — it's a
  // window-level chrome action, not a screen navigation key).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        void toggleFullscreen().then(setFull);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = useCallback(() => void toggleFullscreen().then(setFull), []);

  return { full, toggle };
}
