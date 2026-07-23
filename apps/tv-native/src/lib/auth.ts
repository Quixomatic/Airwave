import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Native equivalent of tv-web's `auth-client` + `server-url`, minus better-auth's React client:
 * the native app is a bearer-token client that talks to the SAME REST surface, so all it needs is
 * (a) where the server is and (b) the token.
 *
 *  - The **bearer token** is a credential → `expo-secure-store` (Keychain / Keystore).
 *  - The **server URL** and other prefs are not secret → `AsyncStorage`.
 *
 * These are read once at startup into module-level values (mirroring tv-web, where `SERVER_URL` is
 * evaluated at module load and the app re-initialises after onboarding). `loadSession()` hydrates
 * them before the app renders; setters persist AND update the in-memory copy so callers stay sync.
 */

const TOKEN_KEY = "cg-tv-token";
const SERVER_KEY = "cg-tv-server-url";

// A build-time default for dev convenience (set EXPO_PUBLIC_SERVER_URL in .env to skip onboarding),
// exactly like tv-web's BAKED url. Empty in a real build → the app shows the setup screen.
const BAKED = (process.env.EXPO_PUBLIC_SERVER_URL ?? "").replace(/\/+$/, "");

let serverUrl = BAKED;
let token: string | null = null;

/** Hydrate the in-memory session from storage. Call once before rendering the app. */
export async function loadSession(): Promise<void> {
  const [storedUrl, storedToken] = await Promise.all([
    AsyncStorage.getItem(SERVER_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  if (storedUrl) serverUrl = storedUrl.replace(/\/+$/, "");
  token = storedToken ?? null;
}

export function getServerUrl(): string {
  return serverUrl;
}
export function hasServerUrl(): boolean {
  return serverUrl !== "";
}
export async function setServerUrl(raw: string): Promise<void> {
  serverUrl = normalizeServerUrl(raw);
  await AsyncStorage.setItem(SERVER_KEY, serverUrl);
}
export async function clearServerUrl(): Promise<void> {
  serverUrl = BAKED;
  await AsyncStorage.removeItem(SERVER_KEY);
}

export function getToken(): string | null {
  return token;
}
export async function setToken(next: string | null): Promise<void> {
  token = next;
  if (next) await SecureStore.setItemAsync(TOKEN_KEY, next);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

/** Coerce user input into a base URL (add http:// if missing, drop a trailing slash) — tv-web parity. */
export function normalizeServerUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}
