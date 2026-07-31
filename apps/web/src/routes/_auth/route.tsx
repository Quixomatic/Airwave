import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppLayout } from "@/components/layout/app-layout";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
  component: AppLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
    // Admin panel is admins-only (§7.13). `role` is the server-issued, DB-backed value from the better-auth
    // admin plugin (this getSession is a server round-trip), so a non-admin can't forge their way in — and
    // every admin data call is an `adminProcedure` server-side anyway. Non-admins land on /not-authorized.
    const role = (session.data.user as { role?: string | null }).role ?? null;
    if (role !== "admin") {
      throw redirect({ to: "/not-authorized" });
    }
    return { session };
  },
});
