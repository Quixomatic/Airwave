import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { setToken } from "@/lib/auth";

/**
 * Placeholder for the guide (home). The real Aurora grid lands next. For the foundation this just
 * proves the signed-in route resolves and sign-out works end-to-end (token cleared → back to login).
 */
export default function Guide() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-6 bg-bg p-10">
      <Text className="text-3xl font-bold text-fg">You're in.</Text>
      <Text className="max-w-md text-center text-muted">
        The guide grid goes here. This screen confirms login, the session store, and the API client
        all work against your live server.
      </Text>
      <Pressable
        onPress={async () => {
          await setToken(null);
          router.replace("/login");
        }}
        className="rounded-xl border border-white/15 px-6 py-4 active:opacity-70"
      >
        <Text className="text-lg font-semibold text-fg">Sign out</Text>
      </Pressable>
    </View>
  );
}
