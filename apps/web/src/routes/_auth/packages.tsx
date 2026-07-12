import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";

export const Route = createFileRoute("/_auth/packages")({
  staticData: { breadcrumb: "Packages", breadcrumbIcon: LayoutGrid, breadcrumbTint: "violet" },
  component: () => (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Packages</h1>
      <p className="text-muted-foreground mt-1 text-sm">Coming soon.</p>
    </div>
  ),
});
