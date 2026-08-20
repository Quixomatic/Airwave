import { useEffect } from "react";

/**
 * While mounted, let content fill the window to the very top — the app-viewport's top offset drops to
 * 0, so the fullscreen player's video plays edge-to-edge with the (transparent) titlebar floating over
 * it, instead of starting below the titlebar like every other screen. Used by the Phase-4 watch route.
 * Restores the default titlebar clearance on unmount.
 */
export function useFullBleed(active = true) {
  useEffect(() => {
    if (!active) return;
    const el = document.documentElement;
    el.style.setProperty("--content-top", "0px"); // video fills to the very top
    el.style.setProperty("--titlebar-bg", "transparent"); // titlebar floats over the video
    return () => {
      el.style.removeProperty("--content-top");
      el.style.removeProperty("--titlebar-bg");
    };
  }, [active]);
}
