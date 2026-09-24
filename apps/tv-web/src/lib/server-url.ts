/**
 * The TV app talks to a self-hosted Airwave server that lives at a different address for every
 * user — so, unlike the admin web (served same-origin by that server), the TV app can't bake the URL
 * in. It's chosen once during onboarding (`features/setup/server-setup.tsx`), validated against
 * `/api/health`, and stored on the device. A build-time `VITE_SERVER_URL` is only a dev convenience.
 */

const KEY = "cg-tv-server-url";

/**
 * The "auto-point" server URL for the BROWSER-PLAYER persona (the Docker web player + the packaged desktop TV
 * player) — the one that always talks to one fixed server instead of onboarding. Docker BAKES it via vite
 * (`import.meta.env.VITE_SERVER_URL`); the packaged desktop app can't bake it (a fresh port every launch), so its
 * supervisor INJECTS it into the served `index.html` at runtime (`window.__AIRWAVE_ENV__`, the same recipe the
 * admin uses — see apps/desktop `serveDir()`). A real TV app (webOS) has neither → this is "" → it onboards to a
 * user-chosen server. Injected value wins over the baked one, so one prebuilt bundle serves any launch's port.
 */
function injectedServerUrl(): string {
  if (typeof window !== "undefined") {
    const injected = (window as { __AIRWAVE_ENV__?: Record<string, string> }).__AIRWAVE_ENV__?.VITE_SERVER_URL;
    if (typeof injected === "string" && injected.trim()) return injected.trim();
  }
  return "";
}

// A runtime-INJECTED server URL (the serving layer's authority): the desktop supervisor injects the local
// port, and — over the Airwave Cloud tunnel — the connector injects the tunnel origin. It wins over a stored
// onboarding URL, because "how you're reaching me right now" beats a saved address.
const INJECTED = injectedServerUrl().replace(/\/+$/, "");
// A build-time baked URL (the Docker web player's fixed server); only a dev/deploy default.
const ENV_BAKED = ((import.meta.env.VITE_SERVER_URL as string | undefined) || "").replace(/\/+$/, "");
// Any fixed (non-onboarding) server — injected or baked.
const BAKED = INJECTED || ENV_BAKED;

/** Coerce user input into a usable base URL (add http:// if missing, drop a trailing slash). */
export function normalizeServerUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) {
    // Pick the scheme by host: LAN / self-host (localhost, an IP, *.local) is plain HTTP; a real domain is
    // almost always HTTPS. Defaulting a domain to http:// is a silent trap — an http URL to an https server
    // 301s, and the browser turns the redirected login POST into a GET, so the POST-only auth endpoints 404
    // (health is a GET, so it survives the redirect and onboarding wrongly "connects"). See the webOS 404 debug.
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

/**
 * The active server base URL, in precedence order:
 *   1. INJECTED  — the serving layer's runtime authority (desktop supervisor's local port; the cloud relay
 *      connector's tunnel origin). "How you're reaching me right now" wins.
 *   2. stored    — the address chosen during onboarding (webOS TVs, dev).
 *   3. ENV_BAKED — a build-time default (Docker web player).
 * Evaluated at module load — onboarding stores the URL and reloads, so the whole app re-initialises against
 * it (the better-auth client + REST base are all derived from this).
 */
export const SERVER_URL = INJECTED || getStoredServerUrl() || ENV_BAKED;

/** Whether we have a server to talk to yet (else the app shows the setup screen). */
export function hasServerUrl(): boolean {
  return SERVER_URL !== "";
}

/**
 * Whether the server URL is BAKED at build time (`VITE_SERVER_URL`) — true for the browser web
 * player (a fixed deployment that always talks to one server), false for the installed app (which
 * onboards to a user-chosen server). When baked, there's no server to "change" and clearing the
 * stored URL just falls back to the baked one — so the UI offers "Sign out" instead of "Change
 * server", and never tries to reach the (unreachable) setup screen.
 */
export function hasBakedServer(): boolean {
  return BAKED !== "";
}
