import { createContext, useContext, type RefObject } from "react";

/**
 * The player context, split out from `player-context.tsx` so hooks like `use-channel-nav` can read
 * it WITHOUT importing the provider module — which would create a cycle
 * (`player-context` renders `ChannelNumberEntry`, which uses `useChannelNav`, which needs the
 * context). A cycle back into `player-context` breaks React Fast Refresh (it throws
 * "usePlayer must be used within PlayerProvider" on every hot reload). This module imports nothing
 * of ours, so it's a safe shared leaf. `player-context` re-exports `usePlayer` for existing callers.
 */

export type Layout = "off" | "mini" | "full";

export type PlayerCtx = {
  activeChannelId: string | null;
  playingChannelId: string | null;
  layout: Layout;
  miniFocused: boolean;
  miniSel: 0 | 1;
  /** The featured-panel slot the mini feed docks into (guide attaches this ref). */
  miniSlotRef: RefObject<HTMLDivElement | null>;
  tune: (channelId: string) => void;
  goFull: () => void;
  goMini: () => void;
  stop: () => void;
  focusMini: () => void;
  blurMini: () => void;
  miniMove: (dir: -1 | 1) => void;
  miniActivate: () => void;
  /** True while channel-number entry is capturing input. The guide and full-screen chrome read this
   *  (synchronously, at event time) to DEFER the keys number entry owns — OK commits it and Back
   *  cancels it, so neither should also tune / exit / pop to mini. A ref (not state) so the keydown
   *  handlers see the current value without re-registering. */
  numberEntryActiveRef: RefObject<boolean>;
};

export const Ctx = createContext<PlayerCtx | null>(null);

export function usePlayer(): PlayerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlayer must be used within PlayerProvider");
  return c;
}
