import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";

import { TvPressable as Pressable } from "@/components/tv-pressable";
import { AuroraGrid } from "@/features/guide/aurora-grid";
import { usePlayer } from "@/features/watch/player-context";
import { useFavorites, useGuide, useSetFavorite } from "@/hooks/queries";
import { scaled } from "@/features/guide/layout";
import { capsDoneForCurrentServer } from "@/lib/device";
import { LAYER, useKeyLayer } from "@/lib/input";
import { C } from "@/lib/theme";

/**
 * The guide route — fetches the cross-channel grid + favorites and renders the Aurora grid
 * (featured panel, time-grid, sidebar sliver/expand, now-marker, GuideGhost), at parity with tv-web.
 */
export default function GuideRoute() {
  const router = useRouter();
  const player = usePlayer();
  const { data, error, isLoading } = useGuide(180);
  const { data: favData } = useFavorites();
  const setFavorite = useSetFavorite();

  const favoriteIds = new Set(favData?.channelIds ?? []);

  // First sign-in (or a server switch) → run the capability diagnostic so the server has this
  // device's profile before playback (else /media can't pick direct-play vs HLS correctly).
  useEffect(() => {
    if (!capsDoneForCurrentServer()) router.replace("/diagnostic");
  }, [router]);

  if (isLoading || (!data && !error)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }
  if (error) {
    return <GuideError onSettings={() => router.replace("/settings")} />;
  }

  return (
    // Full-bleed (no SafeAreaView) — tv-web fills the screen and the guide's own internal padding
    // handles spacing; the tvOS overscan insets were leaving unused strips above/below the grid+sidebar.
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <AuroraGrid
        channels={data!.channels}
        serverTime={data!.serverTime}
        favoriteIds={favoriteIds}
        onToggleFavorite={(channelId) => setFavorite.mutate({ channelId, favorite: !favoriteIds.has(channelId) })}
        onTune={(channelId) => player.tune(channelId)}
        onSettings={() => router.push("/settings")}
        onAccount={() => router.push("/settings/user")}
      />
    </View>
  );
}

/**
 * Guide-load failure — RECOVERABLE, not a dead-end. The server didn't respond (unreachable / down /
 * wrong address), so instead of stranding the user we offer a way to Settings (change server / sign out).
 * OK (D-pad) or a tap activates it — a one-item zone machine so the TV remote isn't stuck.
 */
function GuideError({ onSettings }: { onSettings: () => void }) {
  useKeyLayer({
    id: "guide-error",
    priority: LAYER.BASE,
    onKey(e) {
      if (e.key === "ok") {
        onSettings();
        return true;
      }
      return false;
    },
  });
  return (
    <View style={scaled({ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg, gap: 18, padding: 40 })}>
      <Text style={scaled({ color: "#f1f5f9", fontSize: 22, fontWeight: "700" })}>Couldn't load the guide</Text>
      <Text style={scaled({ color: C.mutedFg, fontSize: 16, textAlign: "center", maxWidth: 620, lineHeight: 24 })}>
        Your server didn't respond. Check that it's running and reachable — or open Settings to change servers or sign out.
      </Text>
      <Pressable
        onPress={onSettings}
        focusable={!Platform.isTV}
        style={scaled({ marginTop: 8, borderRadius: 12, borderWidth: 2, borderColor: C.accent, paddingHorizontal: 30, paddingVertical: 12, backgroundColor: "rgba(74,159,224,0.14)" })}
      >
        <Text style={scaled({ color: "#f1f5f9", fontSize: 17, fontWeight: "600" })}>Open Settings · OK</Text>
      </Pressable>
    </View>
  );
}
