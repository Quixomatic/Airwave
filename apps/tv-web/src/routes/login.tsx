import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { Login } from "../features/auth/login";
import { getToken } from "../lib/auth-client";

/** /login — already-signed-in devices skip straight to the guide. */
export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (getToken()) throw redirect({ to: "/" });
  },
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useNavigate();
  return <Login onSignedIn={() => void navigate({ to: "/" })} />;
}
