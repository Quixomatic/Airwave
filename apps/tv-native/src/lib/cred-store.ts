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

// @better-auth/expo 1.6 stores its session under these two keys (storagePrefix "cg"). We migrate only
// those, rather than copying every device preference into credential storage.
const SYNC_KEYS = ["cg_cookie", "cg_session_data"];

/** Trigger the one-time AsyncStorage→UserDefaults migration of the better-auth session at startup, so the
 *  synchronous reads below see it. Best-effort: UserDefaults reads don't fail, and a missing value just
 *  means "signed out". No-op off Apple TV. */
export async function hydrateSyncCreds(): Promise<void> {
  if (!isAppleTV) return;
  await Promise.allSettled(SYNC_KEYS.map((key) => SessionStorage.getItem(key)));
}

/** Clear the better-auth session (cookie + session data) on sign-out. No-op off Apple TV. */
export async function clearSyncCreds(): Promise<void> {
  if (!isAppleTV) return;
  await Promise.allSettled(SYNC_KEYS.map((key) => CredStore.deleteItemAsync(key)));
}

/** The Expo auth client reads its session SYNCHRONOUSLY. On Apple TV both credential interfaces share the
 *  same durable UserDefaults store (no stale in-memory cache); elsewhere it's SecureStore's sync accessors. */
export const SyncCredStore = isAppleTV
  ? TVSessionStorage
  : {
      getItem: (key: string) => SecureStore.getItem(key),
      setItem: (key: string, value: string) => SecureStore.setItem(key, value),
    };
