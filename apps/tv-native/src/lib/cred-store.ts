import * as SecureStore from "expo-secure-store";

import { isAppleTV, SessionStorage, TVSessionStorage } from "./session-storage";

/** Keep the Apple TV keychain-free: SecureStore access previously crashed release builds
 * with RN's New Architecture (facebook/react-native#54859). UserDefaults replaces the
 * purgeable AsyncStorage fallback; iOS/iPadOS and Android retain SecureStore. */
export const CredStore = isAppleTV
  ? {
      getItemAsync: (key: string) => SessionStorage.getItem(key),
      setItemAsync: (key: string, value: string) => SessionStorage.setItem(key, value),
      deleteItemAsync: (key: string) => SessionStorage.removeItem(key),
    }
  : {
      getItemAsync: (key: string) => SecureStore.getItemAsync(key),
      setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      deleteItemAsync: (key: string) => SecureStore.deleteItemAsync(key),
    };

// @better-auth/expo 1.6 uses these two keys with storagePrefix: "cg". Migrate only
// those values, rather than copying all device preferences into credential storage.
const SYNC_KEYS = ["cg_cookie", "cg_session_data"];

export async function hydrateSyncCreds(): Promise<void> {
  if (!isAppleTV) return;
  const results = await Promise.allSettled(SYNC_KEYS.map((key) => SessionStorage.getItem(key)));
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Could not read saved credentials");
  }
}

export async function clearSyncCreds(): Promise<void> {
  const results = await Promise.allSettled(SYNC_KEYS.map((key) => CredStore.deleteItemAsync(key)));
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Could not clear saved credentials");
  }
}

/** The Expo auth client needs synchronous reads. Both credential interfaces now use
 * the same persistent tvOS store, without a stale cache or fire-and-forget writes. */
export const SyncCredStore = isAppleTV
  ? TVSessionStorage
  : {
      getItem: (key: string) => SecureStore.getItem(key),
      setItem: (key: string, value: string) => SecureStore.setItem(key, value),
    };
