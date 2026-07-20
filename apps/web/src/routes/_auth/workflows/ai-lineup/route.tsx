import { Outlet, createFileRoute } from "@tanstack/react-router";
import { Workflow } from "lucide-react";

/**
 * Layout for `/workflows/ai-lineup/*` — declares the section breadcrumb + icon.
 *
 * This file is what makes the nested run page work at all. Without it, `ai-lineup.tsx` was
 * itself the parent route AND rendered the runs list, so navigating to `/ai-lineup/:runId`
 * matched the child but the parent had no `<Outlet />` to render it into — the list just kept
 * showing. Matches the `channels/` / `packages/` / `sources/` convention: a `route.tsx` layout
 * holding an Outlet, an `index.tsx` for the list, and `$runId.tsx` for the detail.
 */
export const Route = createFileRoute("/_auth/workflows/ai-lineup")({
  staticData: { breadcrumb: "AI Lineup", breadcrumbIcon: Workflow, breadcrumbTint: "cyan" },
  component: () => <Outlet />,
});
