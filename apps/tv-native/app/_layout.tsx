import "../global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Dimensions, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BootSplash } from "@/components/boot-splash";
import { OVERSCAN_H, OVERSCAN_V } from "@/features/guide/layout";
import { PlayerProvider } from "@/features/watch/player-context";
import { loadSession } from "@/lib/auth";
import { loadDevice } from "@/lib/device";
import { notifyInputActivity, useAndroidBack, useHardwareKeyInput, useTVInput } from "@/lib/input";
import { C } from "@/lib/theme";

// Startup diagnostic — isTV drives UI_SCALE + the focusable/native-focus gating; the window dp size +
// scale tell us why fixed-dp chrome (sidebar/border-radius) looks oversized vs the vwOf-scaled guide on a
// given screen. Readable in Metro/logcat even when on-screen input is broken. (Temporary; remove once the
// Android TV build is sorted.)
{
  const d = Dimensions.get("window");
  const s = Dimensions.get("screen");
  console.log(
    `[platform] OS=${Platform.OS} v=${String(Platform.Version)} isTV=${Platform.isTV} ` +
      `win=${Math.round(d.width)}x${Math.round(d.height)} screen=${Math.round(s.width)}x${Math.round(s.height)} ` +
      `scale=${d.scale} fontScale=${d.fontScale}`,
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/**
 * Root layout — the native analogue of tv-web's `main.tsx` + `__root`. Hydrates the session
 * (server URL + token) from device storage BEFORE rendering, so `SERVER_URL`-equivalents are set
 * when the API client and the route guards first run. Wraps everything in the providers a native
 * app needs: gesture handler (root), safe-area, and TanStack Query (the SAME lib as tv-web).
 */
export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [bootDone, setBootDone] = useState(false);

  // Input sources → the one dispatcher (tv-web's model). `useTVInput` = the TV remote D-pad (TV builds
  // only). `useHardwareKeyInput` = a physical keyboard/remote via GCKeyboard — this is what makes the
  // D-pad zone machine + channel-number entry drivable on the iPad. Touch drives the same state too.
  useTVInput();
  useHardwareKeyInput();
  useAndroidBack();

  useEffect(() => {
    void Promise.all([loadSession(), loadDevice()]).finally(() => setReady(true));
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }} onTouchStart={() => notifyInputActivity()}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          {/* ONE global Android-TV overscan inset for the whole app (real TVs crop ~5% of the edges over
              HDMI). Every screen keeps its normal Apple-TV / full-bleed layout; this is the only place the
              overscan is applied, so the sidebar + content always move in together (no gaps). 0 on iPad /
              Apple TV (no overscan; tvOS manages its own safe area) → a no-op pass-through there. */}
          <View style={{ flex: 1, paddingHorizontal: OVERSCAN_H, paddingVertical: OVERSCAN_V }}>
            {ready && (
              <PlayerProvider>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: C.bg },
                    animation: "fade",
                  }}
                />
              </PlayerProvider>
            )}
          </View>
          {/* Animated Airwave boot splash — overlays the whole app on launch, then fades into the guide once
              the session is loaded and the intro has played. The app mounts underneath (ready) so it's warm. */}
          {!bootDone && <BootSplash onFinish={() => setBootDone(true)} />}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
