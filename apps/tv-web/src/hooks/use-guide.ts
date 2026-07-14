import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

/**
 * The cross-channel guide grid (every enabled channel × a forward window of
 * PROGRAM slots). Thin hook over `/api/v1/guide`. Refetches periodically so the
 * now-line and "what's on" stay live without a manual reload.
 */
export function useGuide(forwardMinutes = 180) {
  return useQuery({
    queryKey: ["guide", forwardMinutes],
    queryFn: () => api.guide(forwardMinutes),
    refetchInterval: 60_000,
  });
}
