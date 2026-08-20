import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../lib/api";

const KEY = ["favorites"];

/** This user's favorited channel ids (server-side, so they follow the user across devices). */
export function useFavorites() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.favorites(),
    staleTime: 60_000,
  });
}

/**
 * Favorite / unfavorite a channel. Flips the cached set **optimistically** so the heart responds
 * instantly on the TV (a round-trip would feel laggy at 10 feet), rolling back if the write fails.
 */
export function useSetFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ channelId, favorite }: { channelId: string; favorite: boolean }) =>
      api.setFavorite(channelId, favorite),
    onMutate: async ({ channelId, favorite }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<{ channelIds: string[] }>(KEY);
      qc.setQueryData<{ channelIds: string[] }>(KEY, (old) => {
        const ids = old?.channelIds ?? [];
        return {
          channelIds: favorite ? [...new Set([...ids, channelId])] : ids.filter((id) => id !== channelId),
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
