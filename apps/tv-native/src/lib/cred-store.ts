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
 */
const isAppleTV = Platform.OS === "ios" && Platform.isTV;

export const CredStore = isAppleTV
  ? {
      getItemAsync: (key: string) => AsyncStorage.getItem(key),
      setItemAsync: (key: string, value: string) => AsyncStorage.setItem(key, value),
      deleteItemAsync: (key: string) => AsyncStorage.removeItem(key),
    }
  : {
      getItemAsync: (key: string) => SecureStore.getItemAsync(key),
      setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      deleteItemAsync: (key: string) => SecureStore.deleteItemAsync(key),
    };
