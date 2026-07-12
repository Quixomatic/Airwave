import * as React from "react";
import { cn } from "@ChannelGuide/ui/lib/utils";

/**
 * Tinted rounded square containing a small icon. Sidebar nav items, menu
 * rows, settings nav, and similar surfaces use it.
 *
 * Mirrors Twenty's `TintedIconTile` shape — light tint background + matching
 * border + saturated icon color. Their palette uses shades 5/6/11; ours
 * maps to Tailwind 100/200/700 (light) and 950/40 / 900 / 300 (dark) per
 * tint. Adding a tint = adding a row in TINT_CLASSES.
 *
 * `icon` accepts any React component that renders an SVG (lucide-react and
 * @phosphor-icons/react both fit). It's rendered inside the tile and inherits
 * the text color so we don't have to thread color props through.
 */

export type TintedIconTileTint =
  | "gray"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "pink"
  | "rose"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky";

/** All tint tokens, in a sensible swatch order (for pickers). */
export const TINT_TOKENS: TintedIconTileTint[] = [
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
  "rose",
];

export type TintedIconTileSize = "sm" | "md" | "lg";

type Props = {
  /** Icon component — receives className for sizing + color (currentColor). */
  icon: React.ComponentType<{ className?: string }>;
  tint?: TintedIconTileTint;
  size?: TintedIconTileSize;
  className?: string;
};

/**
 * Tailwind class triplet per tint. Tile bg + 1px border + icon color
 * (delivered via `text-…` so the SVG inherits via `currentColor`).
 * Dark-mode variants use deeper bg + brighter icon for the same vibe.
 */
const TINT_CLASSES: Record<TintedIconTileTint, string> = {
  gray:    "bg-zinc-100   border-zinc-200   text-zinc-700   dark:bg-zinc-900/40   dark:border-zinc-800   dark:text-zinc-300",
  blue:    "bg-blue-100   border-blue-200   text-blue-700   dark:bg-blue-950/40   dark:border-blue-900   dark:text-blue-300",
  indigo:  "bg-indigo-100 border-indigo-200 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-900 dark:text-indigo-300",
  violet:  "bg-violet-100 border-violet-200 text-violet-700 dark:bg-violet-950/40 dark:border-violet-900 dark:text-violet-300",
  purple:  "bg-purple-100 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-900 dark:text-purple-300",
  pink:    "bg-pink-100   border-pink-200   text-pink-700   dark:bg-pink-950/40   dark:border-pink-900   dark:text-pink-300",
  rose:    "bg-rose-100   border-rose-200   text-rose-700   dark:bg-rose-950/40   dark:border-rose-900   dark:text-rose-300",
  red:     "bg-red-100    border-red-200    text-red-700    dark:bg-red-950/40    dark:border-red-900    dark:text-red-300",
  orange:  "bg-orange-100 border-orange-200 text-orange-700 dark:bg-orange-950/40 dark:border-orange-900 dark:text-orange-300",
  amber:   "bg-amber-100  border-amber-200  text-amber-700  dark:bg-amber-950/40  dark:border-amber-900  dark:text-amber-300",
  yellow:  "bg-yellow-100 border-yellow-200 text-yellow-700 dark:bg-yellow-950/40 dark:border-yellow-900 dark:text-yellow-300",
  lime:    "bg-lime-100   border-lime-200   text-lime-700   dark:bg-lime-950/40   dark:border-lime-900   dark:text-lime-300",
  green:   "bg-green-100  border-green-200  text-green-700  dark:bg-green-950/40  dark:border-green-900  dark:text-green-300",
  emerald: "bg-emerald-100 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-300",
  teal:    "bg-teal-100   border-teal-200   text-teal-700   dark:bg-teal-950/40   dark:border-teal-900   dark:text-teal-300",
  cyan:    "bg-cyan-100   border-cyan-200   text-cyan-700   dark:bg-cyan-950/40   dark:border-cyan-900   dark:text-cyan-300",
  sky:     "bg-sky-100    border-sky-200    text-sky-700    dark:bg-sky-950/40    dark:border-sky-900    dark:text-sky-300",
};

/**
 * Icon size uses `!important` because the SidebarMenuButton (and similar
 * parents) enforce `[&_svg]:size-4` on every descendant svg via cva — a
 * descendant selector that out-specifies our utility. The `!` prefix on
 * the icon's size class wins regardless.
 */
const SIZE_CLASSES: Record<TintedIconTileSize, { tile: string; icon: string }> = {
  sm: { tile: "size-4 rounded-[3px]", icon: "!size-2.5" },
  md: { tile: "size-5 rounded-[4px]", icon: "!size-3" },
  lg: { tile: "size-7 rounded-md",    icon: "!size-4" },
};

export function TintedIconTile({
  icon: Icon,
  tint = "gray",
  size = "md",
  className,
}: Props) {
  const tintClass = TINT_CLASSES[tint];
  const { tile, icon } = SIZE_CLASSES[size];
  return (
    <span
      data-slot="tinted-icon-tile"
      className={cn(
        "inline-flex shrink-0 items-center justify-center border",
        tile,
        tintClass,
        className,
      )}
    >
      <Icon className={icon} />
    </span>
  );
}
