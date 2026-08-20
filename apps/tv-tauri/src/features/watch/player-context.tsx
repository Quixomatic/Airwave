import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";

import { Ctx, type Layout, type PlayerCtx } from "./player-ctx";

export { usePlayer } from "./player-ctx";

/**
 * Minimal player provider (Phase 3). It satisfies the `PlayerCtx` interface the guide's zone machine
 * drives, but WITHOUT the mpv player yet — Phase 4 ports tv-native's mpv-based player in here. Layout
 * stays `"off"`, so the guide renders as a pure guide and every mini-feed code path in the grid is
 * inert; tuning is handled by the route (it navigates to the watch route). The callbacks are no-ops
 * that keep the contract satisfied until the real player lands.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [playingChannelId] = useState<string | null>(null);
  const miniSlotRef = useRef<HTMLDivElement | null>(null);
  const noop = useCallback(() => {}, []);

  const value = useMemo<PlayerCtx>(
    () => ({
      activeChannelId: null,
      playingChannelId,
      layout: "off" as Layout,
      miniFocused: false,
      miniSel: 0,
      miniSlotRef,
      tune: noop,
      goFull: noop,
      goMini: noop,
      stop: noop,
      focusMini: noop,
      blurMini: noop,
      miniMove: noop,
      miniActivate: noop,
      channelStep: noop,
    }),
    [playingChannelId, noop],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
