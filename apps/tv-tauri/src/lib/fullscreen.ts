import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * True (borderless, taskbar-covering) fullscreen — a faithful port of soia's `toggleFullscreen`
 * (`usePlaybackCommands.ts`). The mechanism is Tauri's own `WebviewWindow.setFullscreen`, which
 * already abstracts every OS (Windows borderless-over-taskbar, macOS native fullscreen Space, Linux
 * WM). The ONE per-OS wrinkle soia found: on **Windows**, going fullscreen straight from a MAXIMIZED
 * window glitches, so we unmaximize first (the Rust `prepare_window_for_fullscreen` command) and
 * re-maximize on exit. macOS/Linux need none of that — the command is a no-op there.
 */

const win = getCurrentWindow();
const isWindows = typeof navigator !== "undefined" && /\bwindows\b/i.test(navigator.userAgent);

// Remembered across an enter→exit cycle: did we unmaximize (Windows) to get into fullscreen? If so,
// restore the maximized state when leaving. Module-scoped since there's a single window.
let restoreMaximized = false;

export function isFullscreen(): Promise<boolean> {
  return win.isFullscreen().catch(() => false);
}

/** Enter or leave fullscreen. Returns the resulting state. */
export async function setFullscreen(next: boolean): Promise<boolean> {
  const cur = await isFullscreen();
  if (next === cur) return cur;

  if (!next) {
    const shouldRestore = restoreMaximized;
    restoreMaximized = false;
    await win.setFullscreen(false);
    if (shouldRestore) await win.maximize().catch(() => {});
    return false;
  }

  // Entering: on Windows, unmaximize first (returns whether it was maximized) and let it settle.
  const wasMaximized = isWindows
    ? await invoke<boolean>("prepare_window_for_fullscreen").catch(() => false)
    : false;
  restoreMaximized = wasMaximized;
  if (wasMaximized) await new Promise((r) => setTimeout(r, 60)); // let the unmaximize settle
  try {
    await win.setFullscreen(true);
  } catch (error) {
    restoreMaximized = false;
    if (wasMaximized) await win.maximize().catch(() => {});
    throw error;
  }
  return true;
}

export async function toggleFullscreen(): Promise<boolean> {
  return setFullscreen(!(await isFullscreen()));
}
