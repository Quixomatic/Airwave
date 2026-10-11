import { CredStore, clearSyncCreds, hydrateSyncCreds } from "./cred-store";
import { SessionStorage } from "./session-storage";

/**
 * Native equivalent of tv-web's `auth-client` + `server-url`, minus better-auth's React client:
 * the native app is a bearer-token client that talks to the SAME REST surface, so all it needs is
 * (a) where the server is and (b) the token.
 *
 *  - The **bearer token** is a credential → `CredStore` (Keychain/Keystore via SecureStore, except on the
 *    Apple TV where it uses UserDefaults — see `cred-store.ts` for the tvOS release-crash reason).
 *  - The **server URL** is not secret → `SessionStorage` (UserDefaults on tvOS, AsyncStorage elsewhere).
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
let tokenWrites: Promise<unknown> = Promise.resolve();

/** Hydrate the in-memory session from storage. Call once before rendering the app. */
export async function loadSession(): Promise<void> {
  const [urlResult, tokenResult, expoResult] = await Promise.allSettled([
    SessionStorage.getItem(SERVER_KEY),
    CredStore.getItemAsync(TOKEN_KEY),
    // Migrate Apple-TV Expo credentials before any auth screen renders.
    hydrateSyncCreds(),
  ]);
  if (urlResult.status !== "fulfilled" || tokenResult.status !== "fulfilled" || expoResult.status !== "fulfilled") {
    throw new Error("Could not read saved session");
  }
  const storedUrl = urlResult.value;
  const storedToken = tokenResult.value;
  serverUrl = storedUrl ? storedUrl.replace(/\/+$/, "") : BAKED;
  token = storedToken ?? null;
}

export function getServerUrl(): string {
  return serverUrl;
}
export function hasServerUrl(): boolean {
  return serverUrl !== "";
}
export async function setServerUrl(raw: string): Promise<void> {
  const next = normalizeServerUrl(raw);
  await SessionStorage.setItem(SERVER_KEY, next);
  serverUrl = next;
}
export async function clearServerUrl(): Promise<void> {
  await SessionStorage.removeItem(SERVER_KEY);
  serverUrl = BAKED;
}

export function getToken(): string | null {
  return token;
}
function writeToken(next: string | null, rejected?: { token: string; server: string }): Promise<boolean> {
  const write = tokenWrites.then(async () => {
    if (rejected && (token !== rejected.token || serverUrl !== rejected.server)) return false;
    if (next) await CredStore.setItemAsync(TOKEN_KEY, next);
    else {
      await clearSyncCreds();
      await CredStore.deleteItemAsync(TOKEN_KEY);
    }
    token = next;
    return true;
  });
  // Serialize deletion with a concurrent login; failed writes must not block a later retry.
  tokenWrites = write.catch(() => {});
  return write;
}

export async function setToken(next: string | null): Promise<void> {
  await writeToken(next);
}

export function invalidateToken(rejectedToken: string, rejectedServer: string): Promise<boolean> {
  return writeToken(null, { token: rejectedToken, server: rejectedServer });
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
