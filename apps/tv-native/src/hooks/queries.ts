import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

/**
 * TanStack Query hooks over the REST guide API — ported from tv-web's `hooks/*`. Same library, same
 * query keys, so behavior matches (the guide refetches every 60s to keep "what's on" live).
 */
export function useGuide(forwardMinutes = 180) {
  return useQuery({
    queryKey: ["guide", forwardMinutes],
    queryFn: () => api.guide(forwardMinutes),
    refetchInterval: 60_000,
  });
}

export function usePackages() {
  return useQuery({ queryKey: ["packages"], queryFn: () => api.packages() });
}

export function useFavorites() {
  return useQuery({ queryKey: ["favorites"], queryFn: () => api.favorites() });
}

export function useRecents() {
  return useQuery({ queryKey: ["recents"], queryFn: () => api.recents() });
}

export function useSetFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, favorite }: { channelId: string; favorite: boolean }) =>
      api.setFavorite(channelId, favorite),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["favorites"] }),
  });
}
