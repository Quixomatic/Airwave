import * as React from "react";

import { accentTint, accentVivid } from "@ChannelGuide/ui/lib/accent-palette";
import { cn } from "@ChannelGuide/ui/lib/utils";

/**
 * A rounded icon tile tinted from the shared **accent palette** (by swatch key), for CHANNEL and
 * PACKAGE surfaces. Distinct from `TintedIconTile` (which is Tailwind-class-based and used for the
 * app's own nav/breadcrumb chrome): this renders the palette's exact hexes inline, so the admin
 * matches the TV, and it supports every accent key (incl. `mint`/`slate`).
 *
 * Presents the MUTED tint as the fill (large-ish surface) with the VIVID value as the icon, so it
 * reads as a colored chip consistent with the guide.
 */

type Size = "sm" | "md" | "lg" | "xl";
const SIZE: Record<Size, { tile: string; icon: string }> = {
  sm: { tile: "size-4 rounded-[3px]", icon: "!size-2.5" },
  md: { tile: "size-5 rounded-[4px]", icon: "!size-3" },
  lg: { tile: "size-7 rounded-md", icon: "!size-4" },
  xl: { tile: "size-14 rounded-xl", icon: "!size-7" },
};

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function AccentIconTile({
  icon: Icon,
  tint,
  size = "md",
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  /** Accent-palette swatch key (e.g. "orange"); null/unknown falls back to slate. */
  tint?: string | null;
  size?: Size;
  className?: string;
}) {
  const muted = accentTint(tint);
  const { tile, icon } = SIZE[size];
  return (
    <span
      data-slot="accent-icon-tile"
      className={cn("inline-flex shrink-0 items-center justify-center border", tile, className)}
      style={{ background: hexA(muted, 0.16), borderColor: hexA(muted, 0.32), color: accentVivid(tint) }}
    >
      <Icon className={icon} />
    </span>
  );
}
