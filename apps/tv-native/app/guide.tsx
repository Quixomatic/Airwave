import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

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

  // Only a genuine first-load (no data AND no error yet) shows the spinner.
  if (isLoading && !data && !error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  // On an ERROR (server unreachable / down) OR an empty channel list, we STILL render the full guide
  // shell — AuroraGrid is the sidebar + featured chrome + its context-aware GuideGhost. The sidebar's
  // Settings/Account are therefore ALWAYS reachable, so the user can change servers or sign out instead
  // of being stranded on a dead-end. tv-web parity (which renders the shell for zero channels for exactly
  // this reason — we extend it to the error case too). `serverTime` falls back to the client clock when
  // the fetch failed and none is available.
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <AuroraGrid
        channels={data?.channels ?? []}
        serverTime={data?.serverTime ?? new Date().toISOString()}
        favoriteIds={favoriteIds}
        onToggleFavorite={(channelId) => setFavorite.mutate({ channelId, favorite: !favoriteIds.has(channelId) })}
        onTune={(channelId) => player.tune(channelId)}
        onSettings={() => router.push("/settings")}
        onAccount={() => router.push("/settings/user")}
      />
    </View>
  );
}
