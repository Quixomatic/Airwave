import { useEffect, useState } from "react";

/**
 * Tracks whether the platform's on-screen keyboard is up.
 *
 * On a TV a focused `<input>` pops the system keyboard, and while it's showing the app can NOT
 * treat keys normally: LG's own guidance is that **keydown/keyup don't fire for the virtual
 * keyboard except Enter and Back** — you read `input`/`change` on the field instead. So any screen
 * with a text field has to stop claiming D-pad keys while the keyboard owns them, or the two fight.
 *
 * Two signals, because neither alone is enough:
 *  - webOS fires a `keyboardStateChange` DOM event and exposes `webOS.keyboard.isShowing()`.
 *  - Everywhere else (and in the browser web player) we fall back to "is a text field focused",
 *    which the caller supplies.
 */
type WebOSKeyboard = { keyboard?: { isShowing?: () => boolean } };

export function useVirtualKeyboard(): boolean {
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    const read = () => {
      // webOSTV.js (bundled + loaded via <script> in the packaged app) DEFINES webOS.keyboard.isShowing even in
      // a plain browser, and its body references the bare `PalmSystem` global — undefined off-webOS → a
      // ReferenceError that optional chaining can't guard (the function exists; it throws INSIDE). Swallow it:
      // no system keyboard anywhere but a real webOS TV. (This is why tv-web white-screened in the desktop app.)
      try {
        const w = (window as unknown as { webOS?: WebOSKeyboard }).webOS;
        return w?.keyboard?.isShowing?.() ?? false;
      } catch {
        return false;
      }
    };
    setShowing(read());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ visibility?: boolean }>).detail;
      setShowing(detail?.visibility ?? read());
    };
    document.addEventListener("keyboardStateChange", onChange);
    return () => document.removeEventListener("keyboardStateChange", onChange);
  }, []);

  return showing;
}
