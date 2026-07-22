import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { getToken } from "../../lib/auth-client";
import { probeConnection } from "../../lib/plex-connection";
import { PlayerProvider } from "../../features/watch/player-context";

/**
 * The authenticated layout gate — every `_auth/*` route requires a bearer token
 * (mirrors the admin's `_auth/route.tsx`, but token-based instead of cookie/session).
 * Wraps the outlet in the PlayerProvider so the persistent player (the mini-feed that
 * keeps playing when you return to the guide) lives above every authed screen.
 */
export const Route = createFileRoute("/_auth")({
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: "/login" });
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  // Probe which Plex connection this device reaches (local → remote → relay) once per launch,
  // so off-network playback streams from the right base. See lib/plex-connection.ts.
  useEffect(() => {
    void probeConnection();
  }, []);

  return (
    <PlayerProvider>
      <Outlet />
    </PlayerProvider>
  );
}
