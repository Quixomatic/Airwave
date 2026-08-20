import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

/** Recently-watched channel ids, deduped + most-recent-first (the guide's "Recents" lens). Kept
 *  fresh-ish since the heartbeat updates it while you watch. */
export function useRecents() {
  return useQuery({
    queryKey: ["recents"],
    queryFn: () => api.recents(),
    staleTime: 30_000,
  });
}
