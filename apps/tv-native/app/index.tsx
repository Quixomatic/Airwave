import { Redirect } from "expo-router";

import { getToken, hasServerUrl } from "@/lib/auth";

/**
 * Entry gate — the native analogue of tv-web's `main.tsx` routing + the `_auth` guard:
 *  - no server yet  → onboarding (setup)
 *  - no token       → login
 *  - signed in      → the guide (home)
 */
export default function Index() {
  if (!hasServerUrl()) return <Redirect href="/setup" />;
  if (!getToken()) return <Redirect href="/login" />;
  return <Redirect href="/guide" />;
}
