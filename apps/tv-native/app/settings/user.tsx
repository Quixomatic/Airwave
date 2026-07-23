import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { setToken } from "@/lib/auth";
import { C } from "@/lib/theme";

/** TEMPORARY user stub — keeps sign-out reachable while the full settings pages are ported. */
export default function UserSettings() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ padding: 20, gap: 16 }}>
        <Text style={{ fontSize: 30, fontWeight: "800", color: C.fg }}>User</Text>
        <Pressable
          onPress={async () => {
            await setToken(null);
            router.replace("/login");
          }}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 20, paddingVertical: 16 }}
        >
          <Text style={{ fontSize: 18, color: C.fg }}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
