import { useLocalSearchParams, useRouter } from "expo-router";
import { VideoView } from "expo-video";
import { ArrowLeft } from "lucide-react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useTvPlayer } from "@/features/watch/use-tv-player";
import { C } from "@/lib/theme";

/**
 * Full-screen channel player — increment 1: expo-video plays the current program at the right
 * offset via the effectiveTime clock. The full player chrome (feature panel, scrubber/DVR), the
 * mini player, channel surf, number entry, and ch up/down are the next increments.
 */
export default function Watch() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  const { player, status } = useTvPlayer(channelId);

  const title = status.guide ? (status.guide.showTitle ?? status.guide.title) : "";
  const sub = status.guide?.showTitle && status.guide.season != null && status.guide.episode != null ? `S${status.guide.season}, E${status.guide.episode}${status.guide.title ? ` · ${status.guide.title}` : ""}` : "";

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />

      {/* Bumper interstitial — a client-rendered "Up next" card (no video plays between programs). */}
      {status.state === "bumper" && status.guide && (
        <View style={StyleSheet.absoluteFill}>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg, gap: 12 }}>
            <Text style={{ color: C.mutedFg, fontSize: 18 }}>Up next</Text>
            <Text style={{ color: C.fg, fontSize: 32, fontWeight: "800" }}>{status.guide.showTitle ?? status.guide.title}</Text>
            {status.bumperRemaining != null && <Text style={{ color: C.mutedFg }}>in {status.bumperRemaining}s</Text>}
          </View>
        </View>
      )}

      {status.loading && status.state !== "bumper" && (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      )}

      {status.error && (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", padding: 40 }]}>
          <Text style={{ color: "#f87171", fontSize: 18, textAlign: "center" }}>{status.error}</Text>
        </View>
      )}

      {/* Minimal chrome — back + now-playing. The full feature panel / scrubber is the next increment. */}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 14, padding: 24 }}>
        <Pressable onPress={() => router.back()} style={{ borderRadius: 999, backgroundColor: "rgba(18,24,38,0.55)", padding: 10 }}>
          <ArrowLeft size={24} color="#f1f5f9" />
        </Pressable>
        {!!title && (
          <View>
            <Text style={{ color: "#f1f5f9", fontSize: 20, fontWeight: "700" }}>{title}</Text>
            {!!sub && <Text style={{ color: "#c3c9d4", fontSize: 14 }}>{sub}</Text>}
          </View>
        )}
      </View>
    </View>
  );
}
