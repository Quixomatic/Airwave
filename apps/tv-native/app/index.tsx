import { Redirect } from "expo-router";

import { getToken, hasServerUrl } from "@/lib/auth";

/**
 * Entry gate — the native analogue of tv-web's `main.tsx` routing + the `_auth` guard:
 *  - no server yet  → onboarding (setup screen; not built yet, so fall through to login for now)
 *  - no token       → login
 *  - signed in      → the guide (home)
 *
 * As screens land this becomes the full ladder (setup → login → guide). For the foundation it
 * routes to login when there's no session, and to the guide placeholder once signed in.
 */
export default function Index() {
  if (!hasServerUrl()) return <Redirect href="/login" />;
  if (!getToken()) return <Redirect href="/login" />;
  return <Redirect href="/guide" />;
}
