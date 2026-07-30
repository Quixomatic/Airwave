import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The admin home is the Guide. "/" redirects to /guide so visiting the root lands straight on the guide.
 * The old dashboard is retired (unused for now) — reintroduce a real landing page here if one is ever wanted.
 */
export const Route = createFileRoute("/_auth/")({
  beforeLoad: () => {
    throw redirect({ to: "/guide" });
  },
});
