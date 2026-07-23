import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AuroraGrid } from "@/features/guide/aurora-grid";
import { usePlayer } from "@/features/watch/player-context";
import { useFavorites, useGuide, useSetFavorite } from "@/hooks/queries";
import { capsDoneForCurrentServer } from "@/lib/device";
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
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg, padding: 40 }}>
        <Text style={{ color: C.mutedFg, fontSize: 18 }}>Couldn't load the guide.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top", "bottom"]}>
      <AuroraGrid
        channels={data!.channels}
        serverTime={data!.serverTime}
        favoriteIds={favoriteIds}
        onToggleFavorite={(channelId) => setFavorite.mutate({ channelId, favorite: !favoriteIds.has(channelId) })}
        onTune={(channelId) => player.tune(channelId)}
        onSettings={() => router.push("/settings")}
        onAccount={() => router.push("/settings/user")}
      />
    </SafeAreaView>
  );
}
