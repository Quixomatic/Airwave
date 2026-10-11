import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireNativeModule } from "expo";
import { Platform } from "react-native";

export const isAppleTV = Platform.OS === "ios" && Platform.isTV;

type NativeSessionStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
};

// Lazy: other platforms never load this Apple-only module. Missing native support must fail
// visibly, rather than silently fall back to purgeable storage in an old development client.
function nativeStore(): NativeSessionStore {
  return requireNativeModule<NativeSessionStore>("AirwaveSessionStore");
}

export const TVSessionStorage = {
  getItem(key: string): string | null {
    return nativeStore().getItem(key) || null;
  },
  setItem(key: string, value: string): void {
    if (!nativeStore().setItem(key, value)) throw new Error("Could not persist session storage");
  },
};

/** Migrate surviving cache data once per key. Empty strings are tombstones: a logout/server
 * change must never resurrect a legacy value, even if cleanup fails or caches later disappear. */
async function read(key: string): Promise<string | null> {
  const stored = nativeStore().getItem(key);
  if (stored !== null) return stored || null;
  const legacy = await AsyncStorage.getItem(key);
  TVSessionStorage.setItem(key, legacy ?? "");
  return legacy;
}

export const SessionStorage = isAppleTV
  ? {
      getItem: read,
      async setItem(key: string, value: string): Promise<void> {
        TVSessionStorage.setItem(key, value);
      },
      async removeItem(key: string): Promise<void> {
        // Clean up the legacy credential before committing the durable deletion. If cleanup
        // fails, the caller can retry without memory disagreeing with the durable store.
        await AsyncStorage.removeItem(key);
        TVSessionStorage.setItem(key, "");
      },
    }
  : AsyncStorage;
