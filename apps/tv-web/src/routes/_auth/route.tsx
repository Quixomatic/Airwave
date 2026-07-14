import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { getToken } from "../../lib/auth-client";

/**
 * The authenticated layout gate — every `_auth/*` route requires a bearer token
 * (mirrors the admin's `_auth/route.tsx`, but token-based instead of cookie/session).
 */
export const Route = createFileRoute("/_auth")({
  beforeLoad: () => {
    if (!getToken()) throw redirect({ to: "/login" });
  },
  component: () => <Outlet />,
});
