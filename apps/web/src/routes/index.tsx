import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  // "/" is just an entry point — bounce into the authenticated area, which
  // redirects to /login when there's no session.
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
