/**
 * Resolve a stored channel/package **tint token** (`TintedIconTile` tokens — the Tailwind color
 * names: "blue", "rose", "amber", …) to a vibrant hex the TV renders inline. The admin/`packages/ui`
 * side maps these tokens to Tailwind classes; tv-web uses inline hex, so we keep a parallel map
 * here (Tailwind ~400 shades — bright enough to glow on the dark 10-foot UI). Falls back to a
 * neutral accent for null/unknown tokens.
 */
const TINT_HEX: Record<string, string> = {
  gray: "#a1a1aa",
  red: "#f87171",
  orange: "#fb923c",
  amber: "#fbbf24",
  yellow: "#facc15",
  lime: "#a3e635",
  green: "#4ade80",
  emerald: "#34d399",
  teal: "#2dd4bf",
  cyan: "#22d3ee",
  sky: "#38bdf8",
  blue: "#60a5fa",
  indigo: "#818cf8",
  violet: "#a78bfa",
  purple: "#c084fc",
  pink: "#f472b6",
  rose: "#fb7185",
};

/** The player-chrome / default focus accent (blue-500), used when there's no tint. */
export const DEFAULT_ACCENT = "#3b82f6";

export function tintColor(token?: string | null): string {
  return (token && TINT_HEX[token]) || DEFAULT_ACCENT;
}
