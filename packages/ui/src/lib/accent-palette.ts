/**
 * The channel/package accent palette — the single source of truth for the swatches a user can
 * pick in the admin, shared by both the admin web app and the TV app.
 *
 * Two roles per swatch (see `.refs/tv-channel-grid-design/ACCENT_PALETTE.md`):
 * - **`vivid`** — the saturated value stored/picked. Shown at full strength only on SMALL,
 *   high-contrast surfaces: the picker swatch, the sidebar package dot.
 * - **`tint`** — a calmer value used everywhere the color touches a LARGE area on the dark grid
 *   (rail/cell fill, channel-row icon), hand-tuned so each hue lands on the original style-guide
 *   accents. Rule of thumb: **store vivid, present muted** — never paint a large surface with vivid.
 *
 * We store the KEY (e.g. "orange"), not a hex — each app computes vivid/muted from the key, so the
 * palette can be retuned in one place without touching stored data. Pure data (no React) so the
 * server (generator) could reference the key list too.
 */

export type AccentKey =
  | "purple"
  | "violet"
  | "indigo"
  | "blue"
  | "sky"
  | "cyan"
  | "teal"
  | "mint"
  | "green"
  | "yellow"
  | "amber"
  | "orange"
  | "red"
  | "rose"
  | "pink"
  | "slate";

export type AccentSwatch = { key: AccentKey; name: string; vivid: string; tint: string };

// 16 swatches, ordered around the hue wheel. `vivid` values are the saturated picks; `tint` values
// are hand-tuned muted presentations (several land exactly on the original style-guide accents —
// green #3fa66a, orange #d08b2f, rose #d0587e, slate #7c8aa3, sky #4a9fe0). `blue` is nudged deeper
// than `sky` so the two stay distinct (the design doc had merged them).
export const ACCENT_PALETTE: AccentSwatch[] = [
  { key: "purple", name: "Purple", vivid: "#d946ef", tint: "#b06cd8" },
  { key: "violet", name: "Violet", vivid: "#8b5cf6", tint: "#7c6fd6" },
  { key: "indigo", name: "Indigo", vivid: "#6366f1", tint: "#7f88e0" },
  { key: "blue", name: "Blue", vivid: "#3b82f6", tint: "#5b8fd6" },
  { key: "sky", name: "Sky", vivid: "#0ea5e9", tint: "#4a9fe0" },
  { key: "cyan", name: "Cyan", vivid: "#06b6d4", tint: "#3aa0b8" },
  { key: "teal", name: "Teal", vivid: "#22d3ee", tint: "#3fb1a0" },
  { key: "mint", name: "Mint", vivid: "#10b981", tint: "#3fa66a" },
  { key: "green", name: "Green", vivid: "#86efac", tint: "#5cc98a" },
  { key: "yellow", name: "Yellow", vivid: "#facc15", tint: "#d9b544" },
  { key: "amber", name: "Amber", vivid: "#f59e0b", tint: "#c99138" },
  { key: "orange", name: "Orange", vivid: "#f97316", tint: "#d08b2f" },
  { key: "red", name: "Red", vivid: "#ef4444", tint: "#d05a52" },
  { key: "rose", name: "Rose", vivid: "#f43f5e", tint: "#d0587e" },
  { key: "pink", name: "Pink", vivid: "#ec4899", tint: "#c96591" },
  { key: "slate", name: "Slate", vivid: "#94a3b8", tint: "#7c8aa3" },
];

/** All keys in palette order — the set a user can choose from (and the generator cycles). */
export const ACCENT_KEYS: AccentKey[] = ACCENT_PALETTE.map((s) => s.key);

const BY_KEY: Record<string, AccentSwatch> = Object.fromEntries(ACCENT_PALETTE.map((s) => [s.key, s]));
/** Fallback swatch for a null/unknown key (a legacy or hand-entered value) — a neutral, so an
 *  unrecognized value reads as "no color" rather than crashing or defaulting to a loud hue. */
const DEFAULT_KEY: AccentKey = "slate";

export function accentSwatch(key?: string | null): AccentSwatch {
  return (key ? BY_KEY[key] : undefined) ?? BY_KEY[DEFAULT_KEY]!;
}
/** The vivid hex for a key (small high-contrast surfaces). */
export function accentVivid(key?: string | null): string {
  return accentSwatch(key).vivid;
}
/** The muted hex for a key (large surfaces on the dark grid). */
export function accentTint(key?: string | null): string {
  return accentSwatch(key).tint;
}
export function isAccentKey(key?: string | null): key is AccentKey {
  return !!key && key in BY_KEY;
}
