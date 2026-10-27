import { over, toHex } from "./color";
import { AURORA, type GuideTokenPatch, type GuideTokens } from "./guide-tokens";
import { AURORA_THEME } from "./themes/aurora";
import { BLUEPRINT } from "./themes/blueprint";
import { EDITORIAL } from "./themes/editorial";
import { HIGH_CONTRAST } from "./themes/high-contrast";
import { MODERN } from "./themes/modern";
import { NEO_BRUTALIST } from "./themes/neo-brutalist";
import { POP_ART } from "./themes/pop-art";
import { RISOGRAPH } from "./themes/risograph";
import { SWISS_POSTER } from "./themes/swiss-poster";

/**
 * The guide's themes, each with its color variants, and the one pure function that turns a choice into tokens.
 *
 * A theme is a patch over `AURORA` (guide-tokens.ts) and lists the variants it comes in; a variant is a patch over its theme.
 * Light and dark are variants of a theme, never themes of their own, and a variant changes either a whole palette or only
 * where the accent comes from. The first variant is the theme's default.
 *
 *     tokens(theme, variant) = deepMerge(deepMerge(AURORA, theme.tokens), variant.overrides)
 *
 * `deepMerge` merges plain objects key by key and replaces everything else (scalars, arrays, null) wholesale. An unknown theme
 * id resolves to Aurora and an unknown variant id to the theme's default variant, so a bad stored value can never leave the guide
 * unstyled. Aurora is `AURORA` itself, with no patch and one variant, so the standard look is exactly what it was.
 *
 * Theme data is in themes/<id>.ts. It was authored in design px on the 2560-wide reference screen (`vw()`), and the six sizes
 * the guide already had in `line()` / `cs()` units (cellBorderW, ringW, ringOuter.w, cellRadius, liveBar.w, liveBar.r) are stored
 * converted: 1 `line()` px is 4/3 design px at 1080p, so the stored value is 3/4 of the authored one. Aurora's own hairlines
 * (the 1dp row rule and the 1px circle border) are `null`, the stock value on every platform.
 *
 * They change how the guide screen is painted (rows, featured panel, time header, now marker, sidebar, empty state and the dimmer
 * over the guide) and nothing else: Settings, the player and the splash keep the standard look.
 *
 * No react-native imports, so bun can load this file in tests.
 */
export type GuideThemeId = "aurora" | "modern" | "high-contrast" | "risograph" | "pop-art" | "neo-brutalist" | "swiss-poster" | "blueprint" | "editorial";

export type GuideVariant = {
  /** Short, lowercase and stable: it is what a device stores. */
  id: string;
  /** What the picker shows. */
  name: string;
  /** One line under the name. */
  description: string;
  /** `palette` changes surfaces and inks; `accent` changes only where the accent comes from. */
  kind: "palette" | "accent";
  scheme: "dark" | "light";
  /** The fields this variant changes from its theme's own tokens. The default variant changes none. */
  overrides: GuideTokenPatch;
};

export type GuideTheme = {
  id: GuideThemeId;
  name: string;
  /** One line under the name in the picker. */
  description: string;
  /** The id of the variant a device gets when it has not chosen one (the first in `variants`). */
  defaultVariant: string;
  /** The fields this theme changes from `AURORA`. */
  tokens: GuideTokenPatch;
  variants: readonly GuideVariant[];
};

export const DEFAULT_GUIDE_THEME: GuideThemeId = "aurora";
/** Aurora's one variant, and so the variant of the default choice. */
export const DEFAULT_GUIDE_VARIANT = "default";

/** What the theme picker lists, in order: Aurora first. */
export const GUIDE_THEMES: readonly GuideTheme[] = [AURORA_THEME, MODERN, HIGH_CONTRAST, RISOGRAPH, POP_ART, NEO_BRUTALIST, SWISS_POSTER, BLUEPRINT, EDITORIAL];

export function isGuideThemeId(v: unknown): v is GuideThemeId {
  return GUIDE_THEMES.some((t) => t.id === v);
}

/** The theme with this id, or Aurora for an id that names none. */
export function findGuideTheme(id: unknown): GuideTheme {
  return GUIDE_THEMES.find((t) => t.id === id) ?? AURORA_THEME;
}

/** True when `variant` is one of the theme's variants. */
export function isGuideVariantId(theme: unknown, variant: unknown): boolean {
  return findGuideTheme(theme).id === theme && findGuideTheme(theme).variants.some((v) => v.id === variant);
}

/** The variant with this id, or the theme's default variant for an id that names none. */
export function findGuideVariant(theme: GuideTheme, id: unknown): GuideVariant {
  return theme.variants.find((v) => v.id === id) ?? theme.variants.find((v) => v.id === theme.defaultVariant) ?? theme.variants[0]!;
}

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `patch` laid over `base`: plain objects merge key by key, and anything else (a scalar, an array, null) replaces. A key the patch
 * leaves undefined is left alone. Neither argument is changed.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlain(base) || !isPlain(patch)) return (patch === undefined ? base : patch) as T;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(patch)) {
    const p = patch[k];
    if (p === undefined) continue;
    out[k] = isPlain(base[k]) && isPlain(p) ? deepMerge(base[k], p) : p;
  }
  return out as T;
}

const isEmpty = (patch: object) => Object.keys(patch).length === 0;
const resolved = new Map<string, GuideTokens>();

/**
 * The tokens for a theme and one of its variants. Unknown ids fall back as described above, and the answer is cached, so the
 * same choice always gives the same object (what React's memoisation wants) and Aurora's is `AURORA` itself.
 */
export function resolveGuideTokens(theme: string = DEFAULT_GUIDE_THEME, variant?: string): GuideTokens {
  const t = findGuideTheme(theme);
  const v = findGuideVariant(t, variant);
  const key = `${t.id}/${v.id}`;
  let tk = resolved.get(key);
  if (!tk) {
    if (isEmpty(t.tokens) && isEmpty(v.overrides)) {
      tk = AURORA;
    } else {
      const merged = deepMerge(deepMerge(AURORA, t.tokens), v.overrides);
      // The weights the rows read through `titleWeight` and `numberWeight` are the type style's: one source, so they cannot drift.
      tk = { ...merged, titleWeight: merged.typeStyle.title.weight, numberWeight: merged.typeStyle.number.weight };
    }
    resolved.set(key, tk);
  }
  return tk;
}

/**
 * Four colors that say what a variant looks like, for the picker's swatch: the guide's ground, a cell on it, the accent and the
 * ink. With a per-channel accent there is no one color to show, so the focus ring stands in for it.
 */
export function guideSwatch(tk: GuideTokens): [ground: string, surface: string, accent: string, ink: string] {
  const surface = toHex(over(tk.cellBg, over(tk.bg, "#000000")));
  const accent = tk.accentMode === "fixed" && tk.accentFixed ? tk.accentFixed : tk.accentMode === "cycle" && tk.accentCycle?.[0] ? tk.accentCycle[0] : tk.ring;
  return [tk.bg, surface, accent, tk.title];
}
