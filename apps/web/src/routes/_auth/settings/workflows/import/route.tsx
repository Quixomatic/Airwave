import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout for `/settings/workflows/import/*` — the runs list + per-run progress page. A parent route needs
 * an `<Outlet />` to render its child. Breadcrumb chain: Settings › Workflows › Import › Run.
 */
export const Route = createFileRoute("/_auth/settings/workflows/import")({
  staticData: { breadcrumb: "Import" },
  component: () => <Outlet />,
});
