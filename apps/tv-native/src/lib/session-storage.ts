import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, Settings } from "react-native";

export const isAppleTV = Platform.OS === "ios" && Platform.isTV;

/**
 * Durable key-value storage for the small session/config values, Apple-TV-aware.
 *
 * ## Why Apple TV is special
 * On tvOS, `AsyncStorage` writes to `NSCachesDirectory`, which the OS PURGES when storage runs low after the
 * app exits — so the server URL + session silently vanish and the TV drops back to onboarding after a reboot.
 * The one tvOS store with a durability guarantee is **UserDefaults**, which React Native already exposes
 * through its core **`Settings`** module (no native module, no extra dependency). So on Apple TV we back these
 * values with `Settings`; every other platform keeps `AsyncStorage` unchanged.
 *
 * UserDefaults has no delete, so an **empty string is a tombstone**: `removeItem` writes `""`, and reads map
 * `""` back to `null`. That also stops a stale (or not-yet-purged) legacy value from resurrecting a
 * logged-out session or a previous server.
 *
 * ## Security note
 * On Apple TV the bearer token already lived in (unencrypted) AsyncStorage, never the keychain — reading the
 * keychain at startup crashed release builds (RN #54859) and tvOS keychain is unreliable across reboots
 * anyway (see `cred-store.ts`). UserDefaults has the same confidentiality as that AsyncStorage fallback
 * (plaintext inside the app sandbox) but is durable. iPad/iPhone/Android keep the real Keychain/Keystore via
 * SecureStore for credentials.
 */

/** Synchronous NSUserDefaults access via RN's core `Settings`. Empty string reads back as absent (tombstone). */
export const TVSessionStorage = {
  getItem(key: string): string | null {
    const value = Settings.get(key);
    return typeof value === "string" && value !== "" ? value : null;
  },
  setItem(key: string, value: string): void {
    Settings.set({ [key]: value });
  },
};

/**
 * Read a value, migrating a surviving pre-upgrade AsyncStorage value into UserDefaults once. A key that is
 * already present in UserDefaults (including a `""` tombstone) is authoritative and never re-migrated.
 */
async function read(key: string): Promise<string | null> {
  const stored = Settings.get(key);
  if (stored != null) return stored !== "" ? (stored as string) : null;
  const legacy = await AsyncStorage.getItem(key);
  TVSessionStorage.setItem(key, legacy ?? ""); // tombstone when the legacy value is also gone
  return legacy;
}

export const SessionStorage = isAppleTV
  ? {
      getItem: read,
      async setItem(key: string, value: string): Promise<void> {
        TVSessionStorage.setItem(key, value);
      },
      async removeItem(key: string): Promise<void> {
        // Clear any surviving legacy copy first, then write the durable tombstone. If cleanup throws the
        // caller can retry without the durable store disagreeing with what's in memory.
        await AsyncStorage.removeItem(key);
        TVSessionStorage.setItem(key, "");
      },
    }
  : AsyncStorage;
