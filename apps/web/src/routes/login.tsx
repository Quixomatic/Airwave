import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginPage } from "@/features/auth/login-page";
import { authClient } from "@/lib/auth-client";
import { safeRedirect } from "@/lib/safe-redirect";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const session = await authClient.getSession();
    if (session?.data?.user) {
      // Already signed in — honor an intended destination (e.g. /device) if one was passed; else admins
      // into the app, everyone else to the admins-only notice (they can still use the TV apps).
      const dest = safeRedirect(search.redirect);
      if (dest) throw redirect({ href: dest });
      const role = (session.data.user as { role?: string | null }).role ?? null;
      throw redirect({ to: role === "admin" ? "/guide" : "/not-authorized" });
    }
  },
  component: LoginPage,
});
