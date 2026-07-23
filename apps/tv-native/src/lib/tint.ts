import { accentTint, accentVivid } from "./accent-palette";

/**
 * Channel accent helpers, ported from tv-web's `lib/tint.ts`. A channel's key resolves to its own
 * tint, else its package's (mirroring icon inheritance); `undefined` when there's no key, so the
 * caller falls back to an index-derived palette rather than collapsing every untinted channel onto
 * one color.
 */
export const DEFAULT_ACCENT = "#3b82f6";

type Tintable = { tint?: string | null; package?: { tint?: string | null } | null };

/** MUTED accent for large guide surfaces (rail/cell fill, icon). */
export function channelTint(channel: Tintable): string | undefined {
  const key = channel.tint ?? channel.package?.tint;
  return key ? accentTint(key) : undefined;
}

/** VIVID accent for chrome over black video (player chip, scrubber fill). */
export function channelVivid(channel: Tintable): string | undefined {
  const key = channel.tint ?? channel.package?.tint;
  return key ? accentVivid(key) : undefined;
}

/** Index-derived fallback palette — for channels with no tint key at all (tv-web's `accentOf`). */
const FALLBACK = ["#5b8fd6", "#7c6fd6", "#3fa66a", "#d08b2f", "#d0587e", "#3aa0b8", "#c99138", "#b06cd8"];
export function accentOf(index: number): string {
  return FALLBACK[index % FALLBACK.length]!;
}
