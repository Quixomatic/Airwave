import { createContext, useContext } from "react";

import { useGuidePrefs } from "@/lib/guide-prefs";

import { resolveGuideTokens } from "./guide-themes";
import type { GuideTokens } from "./guide-tokens";

/**
 * Tokens to draw with in place of the chosen theme's: the guide's own pieces read `useGuideTokens()`, so a screen that wraps them
 * in this provider (the picker's preview, which shows a theme before it is chosen) paints them in another look without a prop
 * threaded through every one.
 */
const OverrideContext = createContext<GuideTokens | null>(null);
export const GuideTokensOverride = OverrideContext.Provider;

/**
 * The tokens the guide draws with: the theme and color variant chosen in Settings -> Guide, which is Aurora until one is
 * chosen, unless a `GuideTokensOverride` is above. Components call this rather than importing a token set, so a theme change reaches
 * every part of the guide at once.
 */
export function useGuideTokens(): GuideTokens {
  const override = useContext(OverrideContext);
  const { theme, variant } = useGuidePrefs();
  return override ?? resolveGuideTokens(theme, variant);
}
