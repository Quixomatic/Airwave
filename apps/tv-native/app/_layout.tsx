import "../global.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { loadSession } from "@/lib/auth";
import { C } from "@/lib/theme";

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

  useEffect(() => {
    void loadSession().finally(() => setReady(true));
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.bg },
              animation: "fade",
            }}
          />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
