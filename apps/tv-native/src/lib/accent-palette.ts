/**
 * The channel/package accent palette — ported verbatim from `@ChannelGuide/ui/lib/accent-palette`
 * (pure data, no React, explicitly shared between the admin and TV apps). Copied here for now;
 * a later `client-core` package is the natural home to dedupe it with tv-web.
 *
 * Rule: **store vivid, present muted**. `vivid` for small high-contrast surfaces (sidebar dot,
 * player chip over black); `tint` for large surfaces on the dark grid (rail/cell fill, icon).
 */
export type AccentSwatch = { key: string; name: string; vivid: string; tint: string };

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

const BY_KEY: Record<string, AccentSwatch> = Object.fromEntries(ACCENT_PALETTE.map((s) => [s.key, s]));
const DEFAULT_KEY = "slate";

export function accentSwatch(key?: string | null): AccentSwatch {
  return (key ? BY_KEY[key] : undefined) ?? BY_KEY[DEFAULT_KEY]!;
}
export function accentVivid(key?: string | null): string {
  return accentSwatch(key).vivid;
}
export function accentTint(key?: string | null): string {
  return accentSwatch(key).tint;
}
