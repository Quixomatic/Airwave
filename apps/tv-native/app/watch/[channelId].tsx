import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { C } from "@/lib/theme";

/**
 * Watch — placeholder. The player lands here next; it needs native video (expo-video), so it's the
 * point where Expo Go gives way to a development build.
 */
export default function Watch() {
  const { channelId } = useLocalSearchParams<{ channelId: string }>();
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: C.bg, padding: 40 }}>
      <Text style={{ fontSize: 24, fontWeight: "700", color: C.fg }}>Channel {channelId}</Text>
      <Text style={{ color: C.mutedFg, textAlign: "center" }}>The player lands here — it needs native video (a dev build), coming next.</Text>
      <Pressable onPress={() => router.back()} style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 24, paddingVertical: 12 }}>
        <Text style={{ color: C.fg }}>Back to guide</Text>
      </Pressable>
    </View>
  );
}
