import { readFileSync } from "node:fs";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

// `base: "./"` → relative asset URLs so the built app works both served at the supervisor's setup-port root
// AND loaded from `views://setup/` inside the packaged desktop bundle.
export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), react()],
  build: { outDir: "dist", emptyOutDir: true },
  // Baked so the "Report to developer" button can prefill the issue form with the app version.
  define: { __APP_VERSION__: JSON.stringify(version) },
});
