import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `base: "./"` → relative asset URLs so the built app works both served at the supervisor's setup-port root
// AND loaded from `views://setup/` inside the packaged desktop bundle.
export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), react()],
  build: { outDir: "dist", emptyOutDir: true },
});
