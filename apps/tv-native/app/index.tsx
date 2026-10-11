import { Redirect } from "expo-router";

import { sessionRoute } from "@/lib/session-route";

/**
 * Entry gate — the native analogue of tv-web's `main.tsx` routing + the `_auth` guard:
 *  - no server yet  → onboarding (setup)
 *  - no token       → login
 *  - signed in      → the guide (home)
 */
export default function Index() {
  return <Redirect href={sessionRoute()} />;
}
