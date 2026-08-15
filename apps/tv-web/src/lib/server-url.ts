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
function autoPointServerUrl(): string {
  if (typeof window !== "undefined") {
    const injected = (window as { __AIRWAVE_ENV__?: Record<string, string> }).__AIRWAVE_ENV__?.VITE_SERVER_URL;
    if (typeof injected === "string" && injected.trim()) return injected.trim();
  }
  return (import.meta.env.VITE_SERVER_URL as string | undefined) || "";
}

const BAKED = autoPointServerUrl().replace(/\/+$/, "");

/** Coerce user input into a usable base URL (add http:// if missing, drop a trailing slash). */
export function normalizeServerUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
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
 * The active server base URL: a stored (onboarded) address wins, else the build-time dev default.
 * Evaluated at module load — onboarding stores the URL and reloads, so the whole app re-initialises
 * against it (the better-auth client + REST base are all derived from this).
 */
export const SERVER_URL = getStoredServerUrl() || BAKED;

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
