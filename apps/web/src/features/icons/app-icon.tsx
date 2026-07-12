import {
  TINT_TOKENS,
  type TintedIconTileTint,
} from "@ChannelGuide/ui/components/tinted-icon-tile";

import { type IconComponent, resolveIcon } from "./icon-set";

const TINT_SET = new Set<string>(TINT_TOKENS);

/** Render a stored icon id (`lucide:Tv`) directly; nothing if unresolved. */
export function AppIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = resolveIcon(name);
  return Icon ? <Icon className={className} /> : null;
}

/** Coerce an arbitrary stored string to a valid tint token (default gray). */
export function asTint(tint?: string | null): TintedIconTileTint {
  return tint && TINT_SET.has(tint) ? (tint as TintedIconTileTint) : "gray";
}

/**
 * Resolve the effective icon component + tint for a channel/package, following the
 * override → inherited → default chain (a channel inherits its package's icon/tint
 * unless it sets its own).
 */
export function resolveTile(opts: {
  icon?: string | null;
  tint?: string | null;
  inheritedIcon?: string | null;
  inheritedTint?: string | null;
  defaultIcon: IconComponent;
  defaultTint?: TintedIconTileTint;
}): { Icon: IconComponent; tint: TintedIconTileTint } {
  const Icon = resolveIcon(opts.icon ?? opts.inheritedIcon) ?? opts.defaultIcon;
  const tintName = opts.tint ?? opts.inheritedTint ?? opts.defaultTint ?? "gray";
  return { Icon, tint: asTint(tintName) };
}
