import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getToken } from "../../lib/auth-client";
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
  component: () => (
    <PlayerProvider>
      <Outlet />
    </PlayerProvider>
  ),
});
