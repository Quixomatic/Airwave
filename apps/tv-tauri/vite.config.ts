import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri desktop client (Airwave). Dev server on 3003 (server 3000, admin 3001,
// tv-web 3002). The Tauri Rust shell (src-tauri) loads this dev server in dev
// and the built `dist/` in release. `pnpm tauri dev` runs `beforeDevCommand`
// (dev:vite) itself, so `pnpm dev` -> `tauri dev` brings the whole thing up.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Tauri expects a fixed port and its own logs — don't let Vite clear them.
  clearScreen: false,
  server: {
    port: 3003,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 3004 } : undefined,
    // Rust rebuilds itself; don't let Vite watch src-tauri.
    watch: { ignored: ["**/src-tauri/**"] },
  },
  // Surface TAURI_ env vars to the client and target the WebView2/WKWebView baseline.
  envPrefix: ["VITE_", "TAURI_ENV_*"],
});
