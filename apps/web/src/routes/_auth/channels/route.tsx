import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Tv } from "lucide-react";

/** Layout for `/channels/*` — declares the "Channels" breadcrumb + section icon. */
export const Route = createFileRoute("/_auth/channels")({
  staticData: { breadcrumb: "Channels", breadcrumbIcon: Tv, breadcrumbTint: "indigo" },
  component: () => <Outlet />,
});
