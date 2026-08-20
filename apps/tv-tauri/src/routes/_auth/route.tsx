import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getToken } from "../../lib/auth-client";

/**
 * The authenticated layout gate — every `_auth/*` route requires a bearer token (faithful port of
 * tv-web `routes/_auth/route.tsx`). tv-web also wraps the outlet in a PlayerProvider and probes the
 * Plex connection here; those are Phase 4 (player) pieces and land with it. For now: token or bust.
 */
export const Route = createFileRoute("/_auth")({
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: "/login" });
  },
  component: () => <Outlet />,
});
