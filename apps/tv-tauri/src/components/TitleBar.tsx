import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize, Minimize } from "lucide-react";

import { setFullscreen } from "../lib/fullscreen";
import { Logo } from "../lib/logo";
import { useFullscreen } from "../lib/use-fullscreen";

// Borderless window (decorations:false) → we draw our own titlebar. The bar itself
// is a `data-tauri-drag-region` (drag to move); the top-right buttons drive the
// native window ops. Child buttons don't carry the attribute, so they stay clickable.
//
// macOS is the exception: there the window keeps native decorations (traffic lights) with a
// full-size content view (see `configure_macos_titlebar` in lib.rs), so we DON'T draw our own
// min/max/close — the native traffic lights (top-left) handle them, and the green button gives
// native fullscreen. We just tag <html> so CSS hides our controls + pads the brand clear of the lights.
const win = getCurrentWindow();
const IS_MAC = /Mac/i.test(navigator.userAgent);
if (IS_MAC) document.documentElement.classList.add("platform-mac");

export function TitleBar() {
  const { full, toggle } = useFullscreen();
  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="tb-brand" data-tauri-drag-region>
        <Logo markWidth={24} />
        <span className="tb-word">Airwave</span>
      </span>
      {/* macOS uses the native traffic lights (+ F11 still toggles fullscreen) — hide our controls. */}
      {!IS_MAC && (
      <div className="tb-controls">
        <button
          className="tb-btn"
          onClick={toggle}
          aria-label={full ? "Exit full screen" : "Full screen"}
          title={full ? "Exit full screen (F11)" : "Full screen (F11)"}
        >
          {full ? <Minimize size={13} /> : <Maximize size={13} />}
        </button>
        {/* Minimize + maximize stay enabled in fullscreen — they break OUT of fullscreen first, then
            do their thing (minimize the window / go to maximized windowed). */}
        <button
          className="tb-btn"
          onClick={async () => {
            if (full) await setFullscreen(false);
            await win.minimize();
          }}
          aria-label="Minimize"
          title="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" fill="currentColor" /></svg>
        </button>
        <button
          className="tb-btn"
          onClick={async () => {
            if (full) {
              await setFullscreen(false);
              await win.maximize();
            } else {
              await win.toggleMaximize();
            }
          }}
          aria-label="Maximize"
          title="Maximize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
        </button>
        <button className="tb-btn tb-close" onClick={() => win.close()} aria-label="Close" title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>
      )}
    </div>
  );
}
