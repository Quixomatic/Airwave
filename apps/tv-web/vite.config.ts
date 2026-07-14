import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
});
