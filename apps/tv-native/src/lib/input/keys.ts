/**
 * Semantic keys — the RN-TV analogue of tv-web's `lib/input/keys.ts`. On a TV build the remote's
 * D-pad arrives via `useTVEventHandler` as already-semantic event types ('up'/'select'/'menu'/…),
 * so normalization is just a rename to our vocabulary. Everything downstream (the dispatcher, the
 * guide's zone machine) deals in `SemanticKey`, identical to tv-web.
 */
export type SemanticKey = "up" | "down" | "left" | "right" | "ok" | "okLong" | "back" | "chUp" | "chDown" | "digit" | "playPause" | "unknown";

/** `digit` carries 0–9 in `digit`. (Number/channel keys don't arrive via `useTVEventHandler` on the
 *  current RN-TV targets — the on-screen keypad / CH buttons drive that logic directly; these types
 *  exist so a future native key path or a webOS build can feed the same handlers.) */
export type KeyEvent = { key: SemanticKey; digit?: number };

/** react-native-tvos `useTVEventHandler` eventType → SemanticKey.
 *  We map ONLY the reliable inputs: the discrete clickpad-edge presses (`up/down/left/right`), select,
 *  menu, and the dedicated `playPause` media button (a real physical key on the Siri remote — routed
 *  through the same dispatcher so a key layer, e.g. the player, can claim it). We deliberately DO NOT map
 *  the Siri remote's touch `swipeUp/swipeDown/swipeLeft/swipeRight`
 *  — the touchpad is imprecise, so a stray thumb-brush fires a spurious direction, and since every
 *  direction here is a real transition (open panel / channel-surf / mini / sidebar), that read as the
 *  UI "randomly" jumping. The clickpad edges are the true d-pad (physical, reliable — unlike an LG
 *  wheel's detents, a swipe has none). If we want swipe-to-scroll back, the correct way is
 *  `TVEventControl.enableTVPanGesture()` + a pan-distance THRESHOLD (so micro/stray swipes are ignored),
 *  not raw swipe events — a separate, deliberate follow-up. */
export function tvEventToKey(eventType: string): SemanticKey {
  switch (eventType) {
    case "up":
      return "up";
    case "down":
      return "down";
    case "left":
      return "left";
    case "right":
      return "right";
    case "select":
      return "ok";
    case "longSelect":
      return "okLong"; // hold OK — the Siri-remote stand-in for the LG green button (jump to the mini)
    case "menu":
      return "back";
    case "playPause":
      return "playPause"; // dedicated media button → toggles the playing channel (claimed by the player layer)
    default:
      return "unknown";
  }
}
