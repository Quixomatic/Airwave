import type { QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";

/**
 * Root route — mirrors the admin's `createRootRouteWithContext` pattern, minus tRPC
 * (the TV app reads the bearer REST surface, not tRPC). The QueryClient is seeded into
 * the router context (main.tsx) and mounted via the router's `Wrap` option. The app is
 * dark-only (index.html `class="dark"`), so no ThemeProvider.
 */
export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: () => <Outlet />,
});
