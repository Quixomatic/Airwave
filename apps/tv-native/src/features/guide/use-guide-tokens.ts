import { useGuidePrefs } from "@/lib/guide-prefs";

import { resolveGuideTokens } from "./guide-themes";
import type { GuideTokens } from "./guide-tokens";

/**
 * The tokens the guide draws with: the theme and color variant chosen in Settings → Guide, which is Aurora until one is
 * chosen. Components call this rather than importing a token set, so a theme change reaches every part of the guide at once.
 */
export function useGuideTokens(): GuideTokens {
  const { theme, variant } = useGuidePrefs();
  return resolveGuideTokens(theme, variant);
}
