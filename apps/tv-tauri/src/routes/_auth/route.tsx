import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { PlayerProvider } from "../../features/watch/player-context";
import { getToken } from "../../lib/auth-client";

/**
 * The authenticated layout gate — every `_auth/*` route requires a bearer token (faithful port of
 * tv-web `routes/_auth/route.tsx`). Wraps the outlet in the PlayerProvider so the persistent player
 * lives above every authed screen (Phase 3: a minimal provider; Phase 4 fills in the mpv player).
 * tv-web also probes the Plex connection here — that lands with the player in Phase 4.
 */
export const Route = createFileRoute("/_auth")({
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: "/login" });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <PlayerProvider>
      <Outlet />
    </PlayerProvider>
  );
}
