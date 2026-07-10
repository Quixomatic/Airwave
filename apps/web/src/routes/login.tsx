import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginPage } from "@/features/auth/login-page";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (session?.data?.user) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});
