import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Credential storage with a SecureStore-shaped async interface (`getItemAsync` / `setItemAsync` /
 * `deleteItemAsync`), so it's a drop-in for `expo-secure-store` (used by our token store AND by
 * `@better-auth/expo`'s `expoClient`).
 *
 * ## Why this exists — the Apple TV release-build crash
 * On the **Apple TV** we deliberately DON'T use `expo-secure-store`. tvOS's keychain is heavily restricted,
 * and reading it (`searchKeyChain`) at startup throws — which, on a **release + New-Architecture (bridgeless)**
 * build, ABORTS the app before the UI ever appears:
 *   `*** Terminating app due to uncaught exception 'RCTFatalException: non-std C++ exception'`
 * This is React Native framework bug **facebook/react-native#54859** (iOS/tvOS 26 only, release only, fine in
 * debug): a throwing async **void** TurboModule method isn't caught in `ObjCTurboModule::performVoidMethodInvocation`,
 * so the re-thrown exception on a background queue kills the process. `expo-secure-store` is one of the named
 * triggers, and our `loadSession()` hits it at launch — matching the crash exactly.
 *
 * tvOS keychain persistence is unreliable anyway, so on Apple TV we back credentials with **AsyncStorage**.
 * iPad/iOS and Android keep the real Keychain/Keystore via SecureStore (unaffected — this is a no-op there).
 *
 * NOTE: the `[cred-store]` console logs below fire on the Apple TV only, so you can SEE the keychain-free path
 * being exercised in the Metro console (dev client). They log storage KEYS and hit/miss — never token values.
 */
const isAppleTV = Platform.OS === "ios" && Platform.isTV;

// eslint-disable-next-line no-console
const log = (msg: string) => console.log(`[cred-store] ${msg}`);

export const CredStore = isAppleTV
  ? {
      getItemAsync: async (key: string) => {
        const v = await AsyncStorage.getItem(key);
        log(`(AppleTV·AsyncStorage) getItemAsync "${key}" → ${v == null ? "miss" : "hit"}`);
        return v;
      },
      setItemAsync: (key: string, value: string) => {
        log(`(AppleTV·AsyncStorage) setItemAsync "${key}"`);
        return AsyncStorage.setItem(key, value);
      },
      deleteItemAsync: (key: string) => {
        log(`(AppleTV·AsyncStorage) deleteItemAsync "${key}"`);
        return AsyncStorage.removeItem(key);
      },
    }
  : {
      getItemAsync: (key: string) => SecureStore.getItemAsync(key),
      setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      deleteItemAsync: (key: string) => SecureStore.deleteItemAsync(key),
    };

// ── Synchronous credential store for @better-auth/expo's expoClient ──────────────────────────────────────
// better-auth-expo reads its storage SYNCHRONOUSLY (`getItem(key): string | null`) — used by the device-code
// login (`login.tsx`) and `useSession()` (`settings/user.tsx`). On iPad/Android that's expo-secure-store's
// sync accessors (real Keychain/Keystore). On the Apple TV we must NOT touch the keychain at all (same
// RN #54859 crash — logging in or opening Settings → User would hit it), and AsyncStorage has no sync API —
// so we back it with an in-memory cache, hydrated once from AsyncStorage at startup (`hydrateSyncCreds()`,
// awaited in `loadSession()` before any auth screen renders) and write-through to AsyncStorage so the
// better-auth session persists across launches.
const syncCache = new Map<string, string>();

/** Populate the Apple-TV sync cache from AsyncStorage. No-op elsewhere. Awaited at startup in loadSession. */
export async function hydrateSyncCreds(): Promise<void> {
  if (!isAppleTV) return;
  try {
    const keys = await AsyncStorage.getAllKeys();
    const entries = await AsyncStorage.multiGet(keys);
    for (const [k, v] of entries) if (v != null) syncCache.set(k, v);
    log(`(AppleTV) hydrated SyncCredStore cache: ${syncCache.size} key(s) [${[...syncCache.keys()].join(", ")}]`);
  } catch (e) {
    log(`(AppleTV) hydrateSyncCreds FAILED: ${String(e)}`);
  }
}

export const SyncCredStore = isAppleTV
  ? {
      getItem: (key: string): string | null => {
        const v = syncCache.get(key) ?? null;
        log(`(AppleTV) SyncCredStore.getItem "${key}" → ${v == null ? "miss" : "hit"}`);
        return v;
      },
      setItem: (key: string, value: string) => {
        log(`(AppleTV) SyncCredStore.setItem "${key}"`);
        syncCache.set(key, value);
        void AsyncStorage.setItem(key, value);
      },
    }
  : {
      getItem: (key: string) => SecureStore.getItem(key),
      setItem: (key: string, value: string) => SecureStore.setItem(key, value),
    };
