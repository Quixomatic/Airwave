import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Server } from "lucide-react";

/** Layout for `/sources/*` — declares the "Sources" breadcrumb + section icon. */
export const Route = createFileRoute("/_auth/sources")({
  staticData: { breadcrumb: "Sources", breadcrumbIcon: Server, breadcrumbTint: "sky" },
  component: () => <Outlet />,
});
