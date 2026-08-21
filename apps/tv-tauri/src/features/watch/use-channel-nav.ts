import { useCallback, useMemo } from "react";

import { usePlayer } from "./player-ctx";
import { useChannels } from "../../hooks/use-channels";

/**
 * Channel lookups for number entry (§7.2): the ordered lineup, `byNumber`, and the widest channel
 * number's digit count (`maxNumber`). Lookup is client-side against the already-loaded channel list
 * (no server round-trip). `tune` is re-exported so the number-entry commit has the whole surface.
 *
 * CH▲/▼ stepping lives in the provider (`channelStep`) instead, because it needs the in-flight lock
 * that's shared with the persistent player's load lifecycle — see `player-context.tsx`.
 *
 * Faithful port of tv-web `features/watch/use-channel-nav.ts`.
 */
export function useChannelNav() {
  const { data: channels } = useChannels();
  const { tune } = usePlayer();

  const lineup = useMemo(
    () => [...(channels ?? [])].sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    [channels],
  );

  const byNumber = useCallback(
    (n: number) => lineup.find((c) => c.number === n) ?? null,
    [lineup],
  );

  const maxNumber = useMemo(
    () => lineup.reduce((m, c) => Math.max(m, c.number ?? 0), 0),
    [lineup],
  );

  return { byNumber, maxNumber, tune };
}
