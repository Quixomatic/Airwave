import { Platform, View } from "react-native";
import { initialWindowMetrics, useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The iPad status-bar top inset, for screens that show the bar (the guide + settings — the full player
 * hides it). Returns 0 on Apple TV / Android / iPhone so their deliberate full-bleed layout is untouched.
 *
 * Uses the STABLE launch-time inset, not the live one. The full player hides the status bar, which
 * collapses the live `useSafeAreaInsets().top` to 0 while watching; a screen keyed to the live value
 * would reflow/snap when returning from full screen. `initialWindowMetrics` is captured at launch (bar
 * shown), so the space is always reserved and leaving full screen just reveals it — no snap.
 */
export function useIpadStatusBarInset(): number {
  const live = useSafeAreaInsets();
  if (!(Platform.OS === "ios" && Platform.isPad)) return 0;
  return initialWindowMetrics?.insets.top ?? live.top;
}

/**
 * A subtly darker band occupying the iPad status-bar strip. It's a flex block (NOT an absolute overlay,
 * which in RN is positioned relative to the padding box and gets ambiguous next to padding/absolute
 * siblings) — place it as the FIRST child of a screen's full-bleed root view, with the rest of the
 * screen in the flow below it. Renders nothing off-iPad (inset 0), so other platforms are unaffected.
 */
export function StatusBarBand() {
  const top = useIpadStatusBarInset();
  if (top <= 0) return null;
  return <View style={{ height: top, backgroundColor: "rgba(0,0,0,0.3)" }} />;
}
