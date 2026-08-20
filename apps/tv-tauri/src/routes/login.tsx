import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { Login } from "../screens/Login";
import { getToken } from "../lib/auth-client";

/** /login — already-signed-in devices skip straight to the guide. Faithful port of tv-web. */
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
