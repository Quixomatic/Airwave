import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";

import { isFullscreen, toggleFullscreen } from "./fullscreen";

/**
 * Fullscreen state + behavior for the whole app (mounted once, in the TitleBar):
 *  - tracks `full` (synced from the window, so it reflects our button, F11, and OS-driven changes)
 *    for the button's icon,
 *  - binds **F11** anywhere to toggle.
 *
 * The custom titlebar stays VISIBLE in fullscreen (there's room for it) — we don't hide/peek it. The
 * full-screen PLAYER already tucks the titlebar away with its own chrome (`.chrome-hidden`), which is
 * the only place it should disappear.
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
