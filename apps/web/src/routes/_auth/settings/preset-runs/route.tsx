import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout for `/settings/preset-runs/*` — the preset build runs list + per-run observability page. A parent
 * route needs an `<Outlet />` to render its child. Breadcrumb chain: Settings › Preset runs › Run.
 */
export const Route = createFileRoute("/_auth/settings/preset-runs")({
  staticData: { breadcrumb: "Preset runs" },
  component: () => <Outlet />,
});
