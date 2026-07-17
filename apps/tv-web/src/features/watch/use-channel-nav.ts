import { useCallback, useMemo } from "react";

import { usePlayer } from "./player-context";
import { useChannels } from "../../hooks/use-channels";

/**
 * The shared channel-navigation foundation for the remote-control arc (§7.2): the ordered lineup,
 * lookup by channel number, and next/prev. Number entry uses `byNumber` + `maxNumber` today;
 * `next`/`prev` are here for the CH▲/▼ arc (built once the C2's CH keycodes are known via the
 * remote-key probe). `tune` is re-exported so callers have the whole nav surface from one hook.
 *
 * NOTE: no in-flight lock yet — number entry commits deliberately on OK (not spammable). The lock
 * (fire immediately, block further changes until the tune fully completes) lands with CH▲/▼, where
 * rapid presses against the remounting persistent player actually need it, and can be tested on-device.
 */
export function useChannelNav() {
  const { data: channels } = useChannels();
  const { tune, playingChannelId } = usePlayer();

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

  const currentIndex = useMemo(
    () => lineup.findIndex((c) => c.id === playingChannelId),
    [lineup, playingChannelId],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      if (currentIndex < 0) return;
      const target = lineup[currentIndex + delta];
      if (target) tune(target.id); // clamped at the ends (no wrap past first/last)
    },
    [currentIndex, lineup, tune],
  );
  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  return { lineup, byNumber, maxNumber, currentIndex, next, prev, tune };
}
