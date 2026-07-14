import { QueryClient } from "@tanstack/react-query";

/**
 * The single TanStack Query client (mirrors the admin's pattern; the admin creates
 * it in utils/trpc.ts alongside the tRPC proxy — the TV app has no tRPC, it reads the
 * bearer REST surface `/api/v1` via `lib/api.ts`, so the client lives here on its own).
 * Mounted via the router's `Wrap` option in main.tsx.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 10-foot app tunes/leaves screens constantly — keep guide data warm briefly
      // rather than refetching on every focus.
      staleTime: 30_000,
      retry: 1,
    },
  },
});
