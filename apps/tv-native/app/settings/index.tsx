import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { C } from "@/lib/theme";

/**
 * TEMPORARY settings stub — here only so the guide's Settings/Account navigation resolves while we
 * lock the guide's visual parity. The full settings port (the sliver-sidebar shell + General / User
 * / Server / Device / About subpages, at parity with tv-web) is the next piece.
 */
export default function Settings() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ padding: 20, gap: 12 }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: C.fg }}>Settings</Text>
        <Text style={{ color: C.mutedFg }}>Full settings parity is being ported next.</Text>
        <Pressable onPress={() => router.push("/settings/user")} style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 20, paddingVertical: 16 }}>
          <Text style={{ fontSize: 18, color: C.fg }}>User</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/guide")} style={{ borderRadius: 12, backgroundColor: "rgba(255,255,255,0.05)", paddingHorizontal: 20, paddingVertical: 16 }}>
          <Text style={{ fontSize: 18, color: C.fg }}>Back to guide</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
