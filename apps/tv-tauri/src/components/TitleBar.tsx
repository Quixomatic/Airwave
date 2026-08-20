import { getCurrentWindow } from "@tauri-apps/api/window";

import { Logo } from "../lib/logo";

// Borderless window (decorations:false) → we draw our own titlebar. The bar itself
// is a `data-tauri-drag-region` (drag to move); the top-right buttons drive the
// native window ops. Child buttons don't carry the attribute, so they stay clickable.
const win = getCurrentWindow();

export function TitleBar() {
  return (
    <div className="titlebar" data-tauri-drag-region>
      <span className="tb-brand" data-tauri-drag-region>
        <Logo markWidth={24} />
        <span className="tb-word">Airwave</span>
      </span>
      <div className="tb-controls">
        <button className="tb-btn" onClick={() => win.minimize()} aria-label="Minimize" title="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" fill="currentColor" /></svg>
        </button>
        <button className="tb-btn" onClick={() => win.toggleMaximize()} aria-label="Maximize" title="Maximize">
          <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
        </button>
        <button className="tb-btn tb-close" onClick={() => win.close()} aria-label="Close" title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>
    </div>
  );
}
