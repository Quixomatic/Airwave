import { getToken, hasServerUrl } from "./auth";

/**
 * The entry-gate routing decision, in one place so `app/index.tsx` (and anything else that needs it) share
 * one source of truth: no server → setup, a server but no token → login, otherwise the guide. Mirrors
 * tv-web's `main.tsx` gate. Reads the in-memory session, so it's only correct after `loadSession()`.
 */
export function sessionRoute(): "/setup" | "/login" | "/guide" {
  if (!hasServerUrl()) return "/setup";
  return getToken() ? "/guide" : "/login";
}
