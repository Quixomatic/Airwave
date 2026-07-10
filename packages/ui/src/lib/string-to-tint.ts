import type { TintedIconTileTint } from "@ChannelGuide/ui/components/tinted-icon-tile";

/**
 * Deterministic string → tint mapping, ported from Twenty's
 * `stringToThemeColor`. Same input always maps to the same tint, so a
 * user with a given ID always gets the same avatar fallback color, a
 * given tag string always gets the same chip color, etc.
 *
 * Reusable for any "I have a key, give me a stable tint" surface —
 * avatar fallbacks, anonymous user badges, tag chips, source-type
 * indicators. Pass a stable seed (id > email > label).
 *
 * The hash is djb2-flavored (the classic `((h << 5) - h) + char`).
 * Bit-for-bit identical to Twenty's implementation so a record can map
 * to the same color across both apps if we ever need cross-reference.
 *
 * Gray is excluded from the rotation — it reads as "no color" and would
 * make a hashed avatar look like an "unassigned" placeholder.
 */

export const HASHABLE_TINTS: TintedIconTileTint[] = [
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
  "rose",
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
];

export function stringToTint(seed: string | null | undefined): TintedIconTileTint {
  if (!seed) return "gray";
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // force 32-bit int
  }
  const index = Math.abs(hash) % HASHABLE_TINTS.length;
  return HASHABLE_TINTS[index] ?? "gray";
}

/**
 * Tailwind class triplet (bg / border / text) per tint at the same
 * intensity used by avatar fallbacks. Lighter bg than TintedIconTile so
 * initials read clearly on hover-darken surfaces.
 */
export const HASH_TINT_CLASSES: Record<TintedIconTileTint, string> = {
  gray:    "bg-zinc-200    text-zinc-800    dark:bg-zinc-700    dark:text-zinc-200",
  blue:    "bg-blue-200    text-blue-900    dark:bg-blue-800    dark:text-blue-100",
  indigo:  "bg-indigo-200  text-indigo-900  dark:bg-indigo-800  dark:text-indigo-100",
  violet:  "bg-violet-200  text-violet-900  dark:bg-violet-800  dark:text-violet-100",
  purple:  "bg-purple-200  text-purple-900  dark:bg-purple-800  dark:text-purple-100",
  pink:    "bg-pink-200    text-pink-900    dark:bg-pink-800    dark:text-pink-100",
  rose:    "bg-rose-200    text-rose-900    dark:bg-rose-800    dark:text-rose-100",
  red:     "bg-red-200     text-red-900     dark:bg-red-800     dark:text-red-100",
  orange:  "bg-orange-200  text-orange-900  dark:bg-orange-800  dark:text-orange-100",
  amber:   "bg-amber-200   text-amber-900   dark:bg-amber-800   dark:text-amber-100",
  yellow:  "bg-yellow-200  text-yellow-900  dark:bg-yellow-800  dark:text-yellow-100",
  lime:    "bg-lime-200    text-lime-900    dark:bg-lime-800    dark:text-lime-100",
  green:   "bg-green-200   text-green-900   dark:bg-green-800   dark:text-green-100",
  emerald: "bg-emerald-200 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100",
  teal:    "bg-teal-200    text-teal-900    dark:bg-teal-800    dark:text-teal-100",
  cyan:    "bg-cyan-200    text-cyan-900    dark:bg-cyan-800    dark:text-cyan-100",
  sky:     "bg-sky-200     text-sky-900     dark:bg-sky-800     dark:text-sky-100",
};

/**
 * Convenience: hash a seed and return the bg+text class set.
 */
export function tintClassesForSeed(seed: string | null | undefined): string {
  return HASH_TINT_CLASSES[stringToTint(seed)];
}
