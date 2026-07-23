import { createContext, useContext } from "react";

/**
 * The persistent-player context (leaf module, no imports that could cycle), ported from tv-web's
 * `player-ctx.ts`. Playback lives at the root so it survives guide↔watch navigation: tuning plays
 * `full`-screen, Back drops to a `mini` feed over the guide (still playing), Close stops it.
 */
export type Layout = "off" | "full" | "mini";

export type PlayerCtx = {
  activeChannelId: string | null;
  playingChannelId: string | null;
  layout: Layout;
  miniFocused: boolean;
  miniSel: 0 | 1;
  tune: (channelId: string) => void;
  goFull: () => void;
  goMini: () => void;
  stop: () => void;
  focusMini: () => void;
  blurMini: () => void;
  miniMove: (dir: -1 | 1) => void;
  miniActivate: () => void;
  /** Remote CH▲/▼: step the ordered lineup by one (clamped), behind an in-flight lock. */
  channelStep: (dir: 1 | -1) => void;
  /** The guide reports its featured-panel slot rect (screen coords) so the mini feed docks there. */
  setMiniSlot: (rect: { x: number; y: number; width: number; height: number } | null) => void;
};

export const Ctx = createContext<PlayerCtx | null>(null);

export function usePlayer(): PlayerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlayer must be used within PlayerProvider");
  return c;
}
