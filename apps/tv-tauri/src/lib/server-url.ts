/**
 * tv-tauri talks to a self-hosted Airwave server that lives at a different address for every user, so
 * (like tv-web/tv-native) it can't bake the URL in — it's chosen once during onboarding, validated
 * against `/api/health`, and stored on the device. Ported from tv-web `lib/server-url.ts`; a real
 * installed desktop app always onboards (no baked/browser-player persona), so BAKED is always "".
 */

const KEY = "cg-tv-server-url";

/** Coerce user input into a usable base URL (add scheme if missing, drop trailing slash). */
export function normalizeServerUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) {
    // Pick the scheme by host: LAN / self-host (localhost, an IP, *.local) → http; a real domain →
    // https. Defaulting a domain to http is a silent trap: an http URL to an https server 301s, and
    // the redirected login POST becomes a GET, so the POST-only auth endpoints 404 (health is a GET,
    // so it survives → onboarding wrongly "connects"). Fixed across all TV clients.
    const host = u.split("/")[0].split(":")[0].toLowerCase();
    const isLan = host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".local");
    u = `${isLan ? "http" : "https"}://${u}`;
  }
  return u;
}

export function getStoredServerUrl(): string {
  try {
    return (localStorage.getItem(KEY) ?? "").replace(/\/+$/, "");
  } catch {
    return "";
  }
}
export function setStoredServerUrl(url: string) {
  localStorage.setItem(KEY, normalizeServerUrl(url));
}
export function clearStoredServerUrl() {
  localStorage.removeItem(KEY);
}

/** The active server base URL (a stored onboarded address, else empty). Evaluated at module load —
 *  onboarding stores it then reloads, so the whole app re-initialises against it. */
export const SERVER_URL = getStoredServerUrl();

export function hasServerUrl(): boolean {
  return SERVER_URL !== "";
}
