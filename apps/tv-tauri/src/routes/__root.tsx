import type { QueryClient } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";

/**
 * Root route (faithful port of tv-web `routes/__root.tsx`). The QueryClient is seeded into the router
 * context (main.tsx) and mounted via the router's `Wrap` option. The app is dark-only
 * (index.html `class="dark"`), so no ThemeProvider. The custom titlebar is rendered globally in
 * main.tsx (above the router), so the root is just the outlet.
 */
export interface RouterAppContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: () => <Outlet />,
});
