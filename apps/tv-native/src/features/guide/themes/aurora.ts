import type { GuideTheme } from "../guide-themes";

/** The standard guide. It is `AURORA` itself: no patch, one variant. */
export const AURORA_THEME: GuideTheme = {
  id: "aurora",
  name: "Aurora",
  description: "The standard Airwave guide.",
  defaultVariant: "default",
  tokens: {},
  variants: [{ id: "default", name: "Standard", description: "Dark navy, per-channel colour", kind: "palette", scheme: "dark", overrides: {} }],
};
