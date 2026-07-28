import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { scaled } from "@/features/guide/layout";
import { APP_NAME } from "@/lib/app-info";
import { C } from "@/lib/theme";

/**
 * Animated boot splash — the native analogue of tv-web's framer-motion `<Logo animate>`. On launch the
 * whole screen is the Airwave lockup, centered and big: the mark fades + scales in, then the "Airwave"
 * letters cascade up out of it one by one; it holds briefly, then the whole splash fades out into the app.
 *
 * Driven by Reanimated shared values (imperative — deliberately NOT the declarative `FadeIn*` entering
 * animations, whose naming is inverted in this fork). `onFinish` fires after the fade-out completes; the
 * root layout keeps the app mounted underneath so it's warm the moment the splash clears.
 */
const EASE = Easing.bezier(0.22, 1, 0.36, 1);
const MARK_W = 200; // the centerpiece — bigger than the login lockup (100)
const FONT = Math.round(MARK_W * 0.66);
const LETTER_START = 350; // ms — letters begin just before the mark settles, so they spill out of it
const LETTER_STEP = 55; // ms between letters
const LETTER_MS = 400;
const MARK_MS = 500;
const HOLD_MS = 450; // linger on the settled lockup
const OUT_MS = 380; // fade-out

/** One wordmark letter — its own component so each gets its own hooks (no hooks-in-a-loop). */
function Letter({ ch, delay }: { ch: string; delay: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: LETTER_MS, easing: EASE }));
  }, [p, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 16 }],
  }));
  return (
    <Animated.Text style={[scaled({ fontSize: FONT }), { color: "#fff", fontWeight: "700", letterSpacing: -0.5 }, style]}>
      {ch}
    </Animated.Text>
  );
}

export function BootSplash({ onFinish }: { onFinish: () => void }) {
  const markP = useSharedValue(0);
  const rootOpacity = useSharedValue(1);
  const letters = [...APP_NAME];

  useEffect(() => {
    markP.value = withTiming(1, { duration: MARK_MS, easing: EASE });
    const introEnd = LETTER_START + letters.length * LETTER_STEP + LETTER_MS;
    const fadeAt = introEnd + HOLD_MS;
    // Fade the whole splash out once the intro has played + held.
    const fadeTimer = setTimeout(() => {
      rootOpacity.value = withTiming(0, { duration: OUT_MS, easing: EASE });
    }, fadeAt);
    // Hand off to the app on a plain JS timer — NOT the Reanimated completion callback, which can silently
    // not fire and leave the splash stuck over the app. This guarantees the splash always clears.
    const doneTimer = setTimeout(onFinish, fadeAt + OUT_MS + 40);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markStyle = useAnimatedStyle(() => ({
    opacity: markP.value,
    transform: [{ scale: 0.82 + markP.value * 0.18 }],
  }));
  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOpacity.value }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.bg, alignItems: "center", justifyContent: "center" }, rootStyle]}>
      <View style={[{ flexDirection: "row", alignItems: "center" }, scaled({ gap: 18 })]}>
        <Animated.View style={markStyle}>
          <Image
            source={require("../../assets/logo.png")}
            resizeMode="contain"
            style={scaled({ width: MARK_W, height: Math.round((MARK_W * 517) / 715) })}
          />
        </Animated.View>
        <View style={{ flexDirection: "row" }}>
          {letters.map((ch, i) => (
            <Letter key={i} ch={ch} delay={LETTER_START + i * LETTER_STEP} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}
