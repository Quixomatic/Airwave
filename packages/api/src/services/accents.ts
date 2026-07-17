/**
 * Server-side accent-key contract — the swatch KEYS the generator emits, the tRPC layer validates
 * against, and the backfill migrates to. The DB stores a key string (e.g. "orange"); each frontend
 * maps it to vivid/muted hexes itself. **This key list must stay in sync with `ACCENT_PALETTE` in
 * `packages/ui/src/lib/accent-palette.ts`** — kept as its own copy here so the server never has to
 * depend on the UI kit (wrong layering). An unknown key just falls back to a neutral on the client,
 * so a drift degrades gracefully rather than crashing.
 */

export const ACCENT_KEYS = [
  "purple",
  "violet",
  "indigo",
  "blue",
  "sky",
  "cyan",
  "teal",
  "mint",
  "green",
  "yellow",
  "amber",
  "orange",
  "red",
  "rose",
  "pink",
  "slate",
] as const;

export type AccentKey = (typeof ACCENT_KEYS)[number];

const ACCENT_SET = new Set<string>(ACCENT_KEYS);
export const isAccentKey = (v?: string | null): v is AccentKey => !!v && ACCENT_SET.has(v);

/**
 * Legacy `TintedIconTile` tokens → accent keys. Covers the values packages/channels were stored
 * with before the palette (the backfill + a defensive read use this). Tokens that are already
 * valid accent keys map to themselves; the retired ones (`gray`, `lime`, `emerald`) fold to a
 * near neighbor.
 */
export const TOKEN_TO_ACCENT: Record<string, AccentKey> = {
  gray: "slate",
  slate: "slate",
  red: "red",
  orange: "orange",
  amber: "amber",
  yellow: "yellow",
  lime: "green",
  green: "green",
  emerald: "mint",
  teal: "teal",
  cyan: "cyan",
  sky: "sky",
  blue: "blue",
  indigo: "indigo",
  violet: "violet",
  purple: "purple",
  pink: "pink",
  rose: "rose",
  mint: "mint",
};

/** Coerce any stored/legacy tint value to a valid accent key (default slate). */
export const toAccentKey = (v?: string | null): AccentKey =>
  (v && (TOKEN_TO_ACCENT[v] ?? (isAccentKey(v) ? v : undefined))) || "slate";

/**
 * The per-channel variance palette. Channels within a package share contiguous numbers, so painting
 * them all the package's one color made the guide read as long single-color bands. Instead the
 * generator assigns each channel (by a running index) a color from THIS order — chosen so
 * neighbouring colors contrast (warm/cool/hue alternation). Excludes `slate` (reads as "no color").
 */
export const CHANNEL_ACCENT_CYCLE: AccentKey[] = [
  "blue",
  "orange",
  "green",
  "purple",
  "cyan",
  "rose",
  "yellow",
  "indigo",
  "mint",
  "red",
  "sky",
  "violet",
  "amber",
  "teal",
  "pink",
];

/** Deterministic hash of a small integer → a well-mixed unsigned int (no RNG, so the sequence is
 *  stable across the generator and the backfill). */
function hash32(n: number): number {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = (h * 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** How many channels in a row share one color for "segment" `seg`: mostly 1, ~1/3 of the time 2,
 *  occasionally 3 — so the guide gets organic little runs rather than a rigid every-one-different
 *  rotation. */
function runLength(seg: number): number {
  const r = hash32(seg) % 6;
  return r < 3 ? 1 : r < 5 ? 2 : 3; // 3/6 → 1, 2/6 → 2, 1/6 → 3
}

/**
 * The accent key for the channel at running index `i`. Walks variable-length runs (see
 * {@link runLength}); each run advances one step through {@link CHANNEL_ACCENT_CYCLE}, so a color
 * holds for 1–3 channels and then jumps to a different one. Deterministic in `i`.
 */
export function channelAccentAt(i: number): AccentKey {
  const cycle = CHANNEL_ACCENT_CYCLE;
  const idx = Math.max(0, Math.floor(i));
  let seg = 0;
  let start = 0;
  for (;;) {
    const run = runLength(seg);
    if (idx < start + run) break;
    start += run;
    seg++;
  }
  return cycle[seg % cycle.length]!;
}
