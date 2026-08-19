import AsyncStorage from "@react-native-async-storage/async-storage";

import { CredStore, hydrateSyncCreds } from "./cred-store";

/**
 * Native equivalent of tv-web's `auth-client` + `server-url`, minus better-auth's React client:
 * the native app is a bearer-token client that talks to the SAME REST surface, so all it needs is
 * (a) where the server is and (b) the token.
 *
 *  - The **bearer token** is a credential → `CredStore` (Keychain/Keystore via SecureStore, except on the
 *    Apple TV where it falls back to AsyncStorage — see `cred-store.ts` for the tvOS release-crash reason).
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
    CredStore.getItemAsync(TOKEN_KEY),
    // Warm the Apple-TV sync credential cache (for better-auth's expoClient) before any auth screen renders.
    hydrateSyncCreds(),
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
  if (next) await CredStore.setItemAsync(TOKEN_KEY, next);
  else await CredStore.deleteItemAsync(TOKEN_KEY);
}

/** Coerce user input into a base URL (add a scheme if missing, drop a trailing slash) — tv-web parity. */
export function normalizeServerUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) {
    // Pick the scheme by host: LAN / self-host (localhost, an IP, *.local) is plain HTTP; a real domain is
    // almost always HTTPS. Defaulting a domain to http:// is a silent trap — an http URL to an https server
    // 301s, and the redirected login POST becomes a GET, so the POST-only auth endpoints 404 (health is a
    // GET, so it survives the redirect and onboarding wrongly "connects"). tv-web (v0.10.16) / tv-roku parity.
    const host = u.split("/")[0].split(":")[0].toLowerCase();
    const isLan = host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".local");
    u = `${isLan ? "http" : "https"}://${u}`;
  }
  return u;
}
