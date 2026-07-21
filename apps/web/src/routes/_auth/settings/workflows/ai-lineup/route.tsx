import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout for `/settings/workflows/ai-lineup/*` — the runs list + per-run detail.
 *
 * This file is what makes the nested run page work at all: a parent route needs an `<Outlet />`
 * to render its child, or the URL matches but nothing shows. Breadcrumb chain is
 * Settings › Workflows › AI Lineup › Run, so no section icon here (the Settings crumb carries it).
 * Matches the `channels/` / `packages/` convention: `route.tsx` layout + `index.tsx` list +
 * `$runId.tsx` detail.
 */
export const Route = createFileRoute("/_auth/settings/workflows/ai-lineup")({
  staticData: { breadcrumb: "AI Lineup" },
  component: () => <Outlet />,
});
