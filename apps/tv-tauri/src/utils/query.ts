import { QueryClient } from "@tanstack/react-query";

/**
 * The single TanStack Query client (faithful port of tv-web `utils/query.ts`). The app has no tRPC —
 * it reads the bearer REST surface `/api/v1` via `lib/api.ts`. Mounted via the router's `Wrap` option.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
