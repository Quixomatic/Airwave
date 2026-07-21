import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout for `/settings/workflows/*` — holds the `<Outlet />` for the workflows index and the
 * nested per-workflow run pages. Lives under settings (not a top-level section) so it rides the
 * settings tab shell, alongside Jobs & Cache. Breadcrumb is declared here so it isn't repeated
 * on every child.
 */
export const Route = createFileRoute("/_auth/settings/workflows")({
  staticData: { breadcrumb: "Workflows" },
  component: () => <Outlet />,
});
