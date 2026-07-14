import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";
import { defineConfig } from "vite";

// LG webOS panels run old Chromium (the C2 is Chrome 108). Tailwind v4 emits
// bleeding-edge CSS — oklch() theme vars and color-mix() — that landed in
// Chrome 111, so on the C2 every `var(--color-*)` (defined in oklch) resolves
// to an invalid value and the styling silently drops. Running Lightning CSS
// with a Chrome-108 target lowers oklch()→rgb and adds custom-property colour
// fallbacks (and color-mix already ships an @supports hex fallback). Bump the
// target as the oldest webOS Chromium we support moves up.
const TV_TARGETS = browserslistToTargets(browserslist("chrome >= 108"));

// The TV app (webOS first) — a plain Vite React app developed in-browser, then
// packaged for webOS. Dev port 3002 (admin web is 3001, server 3000).
export default defineConfig({
  // Relative asset paths — a packaged webOS app serves from the app root
  // (file://…/), not a domain root, so absolute "/assets/…" URLs would 404.
  base: "./",
  server: {
    port: 3002,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), react()],
  css: {
    transformer: "lightningcss",
    lightningcss: { targets: TV_TARGETS },
  },
  build: {
    cssMinify: "lightningcss",
    // Down-level JS syntax to the panel's engine too (Chrome 108).
    target: "chrome108",
  },
});
