/**
 * Semantic keys — the RN-TV analogue of tv-web's `lib/input/keys.ts`. On a TV build the remote's
 * D-pad arrives via `useTVEventHandler` as already-semantic event types ('up'/'select'/'menu'/…),
 * so normalization is just a rename to our vocabulary. Everything downstream (the dispatcher, the
 * guide's zone machine) deals in `SemanticKey`, identical to tv-web.
 */
export type SemanticKey = "up" | "down" | "left" | "right" | "ok" | "back" | "unknown";

export type KeyEvent = { key: SemanticKey };

/** react-native-tvos `useTVEventHandler` eventType → SemanticKey. */
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
    case "menu":
      return "back";
    default:
      return "unknown";
  }
}
