/**
 * The TV app talks to a self-hosted ChannelGuide server that lives at a different address for every
 * user — so, unlike the admin web (served same-origin by that server), the TV app can't bake the URL
 * in. It's chosen once during onboarding (`features/setup/server-setup.tsx`), validated against
 * `/api/health`, and stored on the device. A build-time `VITE_SERVER_URL` is only a dev convenience.
 */

const KEY = "cg-tv-server-url";
const BAKED = ((import.meta.env.VITE_SERVER_URL as string | undefined) || "").replace(/\/+$/, "");

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
