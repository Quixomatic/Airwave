import { Outlet, createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";

/** Layout for `/packages/*` — declares the "Packages" breadcrumb + section icon. */
export const Route = createFileRoute("/_auth/packages")({
  staticData: { breadcrumb: "Packages", breadcrumbIcon: LayoutGrid, breadcrumbTint: "violet" },
  component: () => <Outlet />,
});
