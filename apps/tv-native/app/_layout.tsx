import "../global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Component, type ReactNode, useEffect, useState } from "react";
import { Dimensions, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { BootSplash } from "@/components/boot-splash";
import { OVERSCAN_H, OVERSCAN_V } from "@/features/guide/layout";
import { PlayerProvider } from "@/features/watch/player-context";
import { getToken, hasServerUrl, loadSession } from "@/lib/auth";
import { loadDevice } from "@/lib/device";
import { notifyInputActivity, useAndroidBack, useHardwareKeyInput, useTVInput } from "@/lib/input";
import { hydrateNetwork, probeConnection } from "@/lib/plex-connection";
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
 * Error boundary around the boot splash. A splash render failure must NEVER blank the app — if it throws,
 * we just skip the animation and show the app underneath.
 */
class SplashBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[boot-splash] render failed, skipping:", err);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
    void Promise.all([loadSession(), loadDevice(), hydrateNetwork()]).finally(() => {
      setReady(true);
      // Refresh which Plex connection this device can actually reach (local → remote → relay) so
      // off-network playback streams from the right URL. Non-blocking; the first media request uses
      // the hydrated last-known value until this resolves. Only when we have a session to probe with.
      if (hasServerUrl() && getToken()) void probeConnection();
    });
  }, []);

  // Hydrate session/device BEFORE mounting the app (route guards read the session synchronously). While
  // loading, a plain dark screen — it matches the splash background, so the hand-off is seamless. This is the
  // original, known-good boot; the splash is a pure overlay ON TOP of the mounted app.
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

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
            <PlayerProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: C.bg },
                  animation: "fade",
                }}
              />
            </PlayerProvider>
          </View>
          {/* Animated Airwave boot splash — overlays the freshly-mounted app, then fades out. Wrapped in an
              error boundary so a splash failure can NEVER blank the app (it just skips the animation). */}
          {!bootDone && (
            <SplashBoundary>
              <BootSplash onFinish={() => setBootDone(true)} />
            </SplashBoundary>
          )}
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
