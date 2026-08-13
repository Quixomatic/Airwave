import type { AppRouter } from "@airwave/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, httpLink, splitLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import { serverUrl } from "@/lib/runtime-env";

function getServerUrl(url: string) {
  const normalized = url.endsWith("/") ? url.slice(0, -1) : url;

  if (!normalized.startsWith("/")) {
    return normalized;
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}${normalized}`;
  }

  const processEnv = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
  const vercelUrl =
    processEnv?.VERCEL_ENV === "production"
      ? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
      : (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelUrl) {
    const origin = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return `${origin}${normalized}`;
  }

  return `http://localhost:3000${normalized}`;
}
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(error.message, {
        action: {
          label: "retry",
          onClick: () => {
            query.invalidate();
          },
        },
      });
    },
  }),
});

const url = `${getServerUrl(serverUrl())}/trpc`;
// Signature matches tRPC's `FetchEsque` (which accepts RequestInfo, not just string | URL).
const withCredentials = (input: URL | RequestInfo, options?: RequestInit) =>
  fetch(input, { ...options, credentials: "include" });

/**
 * Batching is the right default — it collapses a page's queries into one round trip.
 * But a batch resolves as a UNIT: the response waits for the slowest query in it, so one
 * slow procedure stalls every fast one it happens to be batched with. Firing a query
 * "independently" in React Query does NOT avoid this; the transport re-couples them.
 *
 * That bit the channel page: `channels.preview` resolves a whole filter against Plex and
 * was landing in the same batch as `get` / `nowNext` / `schedule`, so the page couldn't
 * render until the preview finished — the exact thing it was supposed to load lazily.
 *
 * Opt a slow query out with `trpc: { context: { skipBatch: true } }` and it gets its own
 * request. Use it for anything that can be slow and isn't needed for first paint.
 */
export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    splitLink({
      condition: (op) => op.context.skipBatch === true,
      true: httpLink({ url, fetch: withCredentials }),
      false: httpBatchLink({ url, fetch: withCredentials }),
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});
