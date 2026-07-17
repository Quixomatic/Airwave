import { type AccentKey, isAccentKey } from "@ChannelGuide/ui/lib/accent-palette";

import { type IconComponent, resolveIcon } from "./icon-set";

/** Render a stored icon id (`lucide:Tv`) directly; nothing if unresolved. */
export function AppIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = resolveIcon(name);
  return Icon ? <Icon className={className} /> : null;
}

/** Coerce an arbitrary stored string to a valid accent key (default slate). */
export function asAccent(tint?: string | null): AccentKey {
  return isAccentKey(tint) ? tint : "slate";
}

/**
 * Resolve the effective icon component + accent key for a channel/package, following the
 * override → inherited → default chain (a channel inherits its package's icon/tint
 * unless it sets its own).
 */
export function resolveTile(opts: {
  icon?: string | null;
  tint?: string | null;
  inheritedIcon?: string | null;
  inheritedTint?: string | null;
  defaultIcon: IconComponent;
  defaultTint?: AccentKey;
}): { Icon: IconComponent; tint: AccentKey } {
  const Icon = resolveIcon(opts.icon ?? opts.inheritedIcon) ?? opts.defaultIcon;
  const tintName = opts.tint ?? opts.inheritedTint ?? opts.defaultTint ?? "slate";
  return { Icon, tint: asAccent(tintName) };
}
