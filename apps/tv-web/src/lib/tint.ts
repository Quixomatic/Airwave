import { accentTint, accentVivid } from "@ChannelGuide/ui/lib/accent-palette";

/**
 * TV-app accent helpers over the shared palette (`@ChannelGuide/ui/lib/accent-palette`). The DB
 * stores a swatch KEY; the guide presents its MUTED tint on large surfaces (rail/cell fill, icon)
 * and the sidebar shows the VIVID value on its small package circles — "store vivid, present muted".
 */

export { accentVivid, accentTint };

/** The player-chrome / default focus accent (blue-500). */
export const DEFAULT_ACCENT = "#3b82f6";

/**
 * A channel's MUTED accent for large guide surfaces — its own key, else inherited from its package
 * (mirrors the icon inheritance). `undefined` when the channel has no key at all, so the caller can
 * fall back to the index-derived palette rather than collapsing every untinted channel onto one color.
 */
export function channelTint(channel: {
  tint?: string | null;
  package?: { tint?: string | null } | null;
}): string | undefined {
  const key = channel.tint ?? channel.package?.tint;
  return key ? accentTint(key) : undefined;
}

/**
 * A channel's VIVID accent — for chrome over BLACK video (the full-screen player: channel chip,
 * scrubber fill, control buttons), where the muted guide tint reads washed out. Same key resolution
 * as {@link channelTint}; `undefined` when the channel has no key so the caller can fall back.
 */
export function channelVivid(channel: {
  tint?: string | null;
  package?: { tint?: string | null } | null;
}): string | undefined {
  const key = channel.tint ?? channel.package?.tint;
  return key ? accentVivid(key) : undefined;
}
