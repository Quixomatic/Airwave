/**
 * Semantic keys — the RN-TV analogue of tv-web's `lib/input/keys.ts`. On a TV build the remote's
 * D-pad arrives via `useTVEventHandler` as already-semantic event types ('up'/'select'/'menu'/…),
 * so normalization is just a rename to our vocabulary. Everything downstream (the dispatcher, the
 * guide's zone machine) deals in `SemanticKey`, identical to tv-web.
 */
export type SemanticKey = "up" | "down" | "left" | "right" | "ok" | "back" | "chUp" | "chDown" | "digit" | "unknown";

/** `digit` carries 0–9 in `digit`. (Number/channel keys don't arrive via `useTVEventHandler` on the
 *  current RN-TV targets — the on-screen keypad / CH buttons drive that logic directly; these types
 *  exist so a future native key path or a webOS build can feed the same handlers.) */
export type KeyEvent = { key: SemanticKey; digit?: number };

/** react-native-tvos `useTVEventHandler` eventType → SemanticKey.
 *  The Siri remote sends discrete `up/down/left/right` only when you CLICK the edges of the clickpad;
 *  a touch SWIPE sends `swipeUp/swipeDown/swipeLeft/swipeRight`. We treat one swipe as one directional
 *  move so the natural swipe gesture drives the guide/zone machine, same as an edge-click or a webOS
 *  d-pad press. (Continuous pan is intentionally NOT enabled — we want discrete steps.) */
export function tvEventToKey(eventType: string): SemanticKey {
  switch (eventType) {
    case "up":
    case "swipeUp":
      return "up";
    case "down":
    case "swipeDown":
      return "down";
    case "left":
    case "swipeLeft":
      return "left";
    case "right":
    case "swipeRight":
      return "right";
    case "select":
      return "ok";
    case "menu":
      return "back";
    default:
      return "unknown";
  }
}
