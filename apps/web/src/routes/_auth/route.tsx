import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppLayout } from "@/components/layout/app-layout";
import { authClient } from "@/lib/auth-client";

// A logged-in non-admin may reach ONLY these routes (everything else is admin-only). `/device` is where
// a viewer approves a TV device-code login, so any authenticated user must be able to get to it.
const VIEWER_ALLOWED = new Set(["/device"]);

export const Route = createFileRoute("/_auth")({
  component: AppLayout,
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession();
    // Guard on `user`, not just `data`, to match /login + /post-login. A misconfigured VITE_SERVER_URL
    // points the auth client at the vite dev server, whose SPA fallback returns index.html with a 200 —
    // so `data` is a truthy HTML string with no `user`, and reading `.role` off it throws before the
    // redirect below can run. Sending them to /login surfaces the misconfiguration instead of crashing.
    if (!session?.data?.user) {
      // Carry the intended path so login can send them back here afterward (e.g. a viewer who followed
      // their TV's /device link before signing in). See lib/safe-redirect + the /login + /post-login loaders.
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    // Admin panel is admins-only (§7.13). `role` is the server-issued, DB-backed value from the better-auth
    // admin plugin (this getSession is a server round-trip), so a non-admin can't forge their way in — and
    // every admin data call is an `adminProcedure` server-side anyway. Non-admins land on /not-authorized,
    // except on the viewer-allowed routes above.
    const role = (session.data.user as { role?: string | null }).role ?? null;
    if (role !== "admin" && !VIEWER_ALLOWED.has(location.pathname)) {
      throw redirect({ to: "/not-authorized" });
    }
    return { session };
  },
});
