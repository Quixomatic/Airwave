import { useQuery } from "@tanstack/react-query";

import { api, type GuideChannel } from "../lib/api";

/**
 * The channel lineup (the guide grid / surfing order). A thin hook over the REST
 * chokepoint (`lib/api.ts`) — the TV-app equivalent of the admin's
 * `useQuery(trpc.channels.list.queryOptions())`, but over `/api/v1` (bearer).
 */
export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: () => api.channels().then((r) => r.channels),
  });
}

export type { GuideChannel };
