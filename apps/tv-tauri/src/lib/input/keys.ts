/**
 * Semantic key normalization — the ONE place raw TV keycodes become app-level intent.
 *
 * Before this existed, the back-key test alone lived in 8 copies across 9 files (in 3 different
 * shapes, one of which was missing `GoBack`/`BrowserBack` and so silently didn't work). Every new
 * screen re-derived it. Now a raw `KeyboardEvent` is translated exactly once, at the boundary, and
 * everything downstream deals in `"back" | "up" | "ok" | …`.
 *
 * This is also the single point where a second platform gets taught: Tizen's Back is 10009 (not
 * webOS's 461), and Tizen only delivers arrows/Enter/Back automatically — media + color keys need
 * `tizen.tvinputdevice.registerKey()` before they arrive at all. Adding Tizen means editing this
 * file, not hunting listeners.
 */

export type SemanticKey =
  | "up"
  | "down"
  | "left"
  | "right"
  | "ok"
  | "playpause"
  | "back"
  | "chUp"
  | "chDown"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "digit"
  | "unknown";

export type KeyEvent = {
  /** What the press MEANS. Layers switch on this, never on raw keycodes. */
  key: SemanticKey;
  /** 0–9 when `key === "digit"`. */
  digit?: number;
  /** The original event — for `preventDefault` decisions and debugging. */
  raw: KeyboardEvent;
  /**
   * Whether this is a repeat from a held key. Derived from OUR OWN keydown/keyup bookkeeping,
   * NOT `KeyboardEvent.repeat` — TV firmware key injection frequently doesn't set that flag.
   */
  repeat: boolean;
};

/**
 * Back. webOS = 461; Tizen = 10009; Samsung Orsay = 88. The string variants cover the different
 * names browsers/webviews report. (Deliberately NOT including "Escape" — no handler in the app
 * responds to Escape today, and adding it would be a behavior change.)
 */
const BACK_CODES = new Set([461, 10009, 88]);
const BACK_NAMES = new Set(["Backspace", "GoBack", "BrowserBack", "XF86Back"]);

/** Channel up/down. The C2 reports these as PageUp/PageDown (33/34); Tizen uses 427/428. */
const CH_UP_CODES = new Set([33, 427]);
const CH_DOWN_CODES = new Set([34, 428]);

/** The color-button block — consistent across webOS/Tizen/HbbTV. */
const COLOR: Record<number, SemanticKey> = {
  403: "red",
  404: "green",
  405: "yellow",
  406: "blue",
};

/** 0–9 from `e.key`, the digit row (48–57), or the numpad (96–105). */
function digitOf(e: KeyboardEvent): number | undefined {
  if (/^\d$/.test(e.key)) return Number(e.key);
  if (e.keyCode >= 48 && e.keyCode <= 57) return e.keyCode - 48;
  if (e.keyCode >= 96 && e.keyCode <= 105) return e.keyCode - 96;
  return undefined;
}

/** Raw browser event → semantic key. `repeat` is supplied by the dispatcher's own bookkeeping. */
export function toKeyEvent(raw: KeyboardEvent, repeat: boolean): KeyEvent {
  const code = raw.keyCode;

  // Desktop: Escape is Back (tv-web deliberately omits it — no TV remote has Escape — but on a
  // desktop keyboard it's the natural "back/close").
  if (raw.key === "Escape") return { key: "back", raw, repeat };
  // Desktop: Spacebar is the universal play/pause (and reveals the chrome if it's hidden). A TV
  // remote has no Space; on a keyboard it's the reflex people reach for to pause.
  if (raw.key === " " || code === 32) return { key: "playpause", raw, repeat };
  if (BACK_CODES.has(code) || BACK_NAMES.has(raw.key)) return { key: "back", raw, repeat };
  if (CH_UP_CODES.has(code)) return { key: "chUp", raw, repeat };
  if (CH_DOWN_CODES.has(code)) return { key: "chDown", raw, repeat };
  // Desktop keyboard: a physical keyboard has no CH▲/▼ (PageUp/Down scroll), so `]`/`[` step the
  // channel up/down — the bracket pair reads as "next/previous" and sits under one hand.
  if (raw.key === "]") return { key: "chUp", raw, repeat };
  if (raw.key === "[") return { key: "chDown", raw, repeat };
  if (COLOR[code]) return { key: COLOR[code]!, raw, repeat };

  switch (raw.key) {
    case "ArrowUp":
      return { key: "up", raw, repeat };
    case "ArrowDown":
      return { key: "down", raw, repeat };
    case "ArrowLeft":
      return { key: "left", raw, repeat };
    case "ArrowRight":
      return { key: "right", raw, repeat };
    case "Enter":
      return { key: "ok", raw, repeat };
  }
  // Some TV webviews report Enter only by keyCode.
  if (code === 13) return { key: "ok", raw, repeat };

  const digit = digitOf(raw);
  if (digit !== undefined) return { key: "digit", digit, raw, repeat };

  return { key: "unknown", raw, repeat };
}

/** A stable identity for the pressed-key bookkeeping (keyCode is the most reliable on TV). */
export function physicalId(e: KeyboardEvent): string {
  return e.keyCode ? `c${e.keyCode}` : `k${e.key}`;
}
