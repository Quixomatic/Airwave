import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "../.."); // repo root

// Captures land in a staging dir so we never clobber the curated screenshots — promote the keepers by hand.
export const OUT = resolve(ROOT, "apps/site/public/screenshots/_captures");
export const MEDIA = resolve(HERE, "media"); // raw Playwright .webm videos (gitignored)
export const AUTH = resolve(HERE, ".auth/state.json"); // saved session — cookies + localStorage (gitignored)

export const URLS = {
  server: "http://localhost:3000",
  admin: "http://localhost:3001",
  tvweb: "http://localhost:3002",
};

// Viewport presets. deviceScaleFactor bumps DPR for crisp retina PNGs.
export const VIEWPORTS = {
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1 }, // admin UI — native 1920×1080
  tv1080: { width: 1920, height: 1080, deviceScaleFactor: 1 }, // exact tvOS store size
  tv4k: { width: 1920, height: 1080, deviceScaleFactor: 2 }, // tv-web real-TV look (3840×2160 out)
  ipad: { width: 1366, height: 1024, deviceScaleFactor: 2 }, // ~iPad 12.9" landscape @2 = 2732×2048
} as const;

export type ViewportName = keyof typeof VIEWPORTS;
