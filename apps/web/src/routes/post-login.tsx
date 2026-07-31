import { createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

/**
 * Post-login redirector. Login callbackURLs point here so there's a single
 * place to decide where a freshly-authenticated user lands.
 *
 * For now: the guide ("/guide", the admin home) when authed, else back to /login. This is the seam for
 * future onboarding gates (e.g. "no linked Plex → /onboarding/plex").
 *
 * `disableCookieCache` so a just-written session cookie is read fresh rather
 * than a stale value from the 5-minute cookie cache.
 */
export const Route = createFileRoute("/post-login")({
  loader: async () => {
    const session = await authClient.getSession({
      query: { disableCookieCache: true },
    });
    if (!session?.data?.user) {
      throw redirect({ to: "/login" });
    }
    // Admins land on the guide; a non-admin who authenticated here gets the admins-only notice.
    const role = (session.data.user as { role?: string | null }).role ?? null;
    throw redirect({ to: role === "admin" ? "/guide" : "/not-authorized" });
  },
});
