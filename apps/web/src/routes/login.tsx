import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginPage } from "@/features/auth/login-page";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (session?.data?.user) {
      // Admins into the app; everyone else to the admins-only notice (they can still use the TV apps).
      const role = (session.data.user as { role?: string | null }).role ?? null;
      throw redirect({ to: role === "admin" ? "/guide" : "/not-authorized" });
    }
  },
  component: LoginPage,
});
