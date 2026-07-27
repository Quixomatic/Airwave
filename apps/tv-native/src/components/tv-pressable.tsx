import { forwardRef } from "react";
import { Platform, Pressable, type PressableProps, type View } from "react-native";

/**
 * A `Pressable` that is NOT part of the tvOS native focus engine by default.
 *
 * ## Why this exists
 * The whole app drives navigation with a **manual zone machine** (ported from tv-web, a browser with
 * no native focus engine — the same model runs on webOS, iPad, and tvOS). On tvOS the OS focus engine
 * is *always on* and can't be globally disabled: a natively-focusable `Pressable` makes the OS fire its
 * `onPress` on `select`, **on top of** our dispatcher — so `select` triggers two things (pause AND the
 * audio picker, close-mini AND tune-channel, etc.). Taking every interactive control out of the focus
 * engine (`focusable={false}` on TV) makes `select` run *only* our zone machine, so tvOS behaves like
 * iPad/webOS.
 *
 * Use this instead of the raw `react-native` `Pressable` in any screen driven by the zone machine
 * (`useKeyLayer`). On iPad/touch it's an ordinary focusable Pressable. Pass `focusable` explicitly to
 * override (rare). Screens that intentionally use the native focus engine (e.g. login/setup, which have
 * no zone machine) should keep the raw `Pressable`.
 */
export const Pressable_ = Pressable; // (kept for anyone who needs the raw one)

export const TvPressable = forwardRef<View, PressableProps>(function TvPressable(props, ref) {
  return <Pressable ref={ref} focusable={!Platform.isTV} {...props} />;
});
