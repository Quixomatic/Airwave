import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

/** Layout for `/users/*` — the list + per-user detail/access. Carries the section breadcrumb. */
export const Route = createFileRoute("/_auth/users")({
  staticData: { breadcrumb: "Users", breadcrumbIcon: Users, breadcrumbTint: "emerald" },
  component: () => <Outlet />,
});
