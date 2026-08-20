import { useQuery } from "@tanstack/react-query";

import { api } from "../lib/api";

/** The channel packages with active channels — the guide sidebar's filter list. Rarely changes,
 *  so it's fetched once and refetched infrequently. */
export function usePackages() {
  return useQuery({
    queryKey: ["packages"],
    queryFn: () => api.packages(),
    staleTime: 5 * 60_000,
  });
}
