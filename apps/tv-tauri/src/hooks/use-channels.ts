import { useQuery } from "@tanstack/react-query";

import { api, type GuideChannel } from "../lib/api";

/**
 * The channel lineup (the guide grid / surfing order). A thin hook over the REST
 * chokepoint (`lib/api.ts`) — faithful port of tv-web `hooks/use-channels.ts` over
 * `/api/v1` (bearer, through the Rust `apiFetch`).
 */
export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: () => api.channels().then((r) => r.channels),
  });
}

export type { GuideChannel };
