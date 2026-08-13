import type { ElectrobunConfig } from "electrobun";

// The built admin (apps/web) + tv-web (apps/tv-web) SPAs, copied into the bundle so the supervisor can serve
// them on local ports. Built by `turbo -F web build && turbo -F tv-web build` before `electrobun build`.
const adminDist = "../web/dist";
const tvwebDist = "../tv-web/dist";
const setupUiDist = "../desktop-setup/dist";

export default {
  app: {
    name: "Airwave",
    identifier: "com.airwave.desktop",
    version: "0.0.1",
  },
  runtime: {
    // Tray-only supervisor — there is no window, so never quit on "last window closed".
    exitOnLastWindowClosed: false,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      [adminDist]: "views/admin",
      [tvwebDist]: "views/tvweb",
      [setupUiDist]: "views/setup",
      // Source assets (tray icon, …) so the bundle can resolve `views://assets/*` at runtime.
      assets: "views/assets",
    },
    watchIgnore: [`${adminDist}/**`, `${tvwebDist}/**`, `${setupUiDist}/**`],
    // CEF is bundled so first-run setup / settings can render in a NATIVE webview window (BrowserWindow → the
    // served `/setup` page) — a nicer onboarding than a browser tab, and desktop-only. The RUNNING app is still
    // tray-first with the browser as the admin/tv-web UI; the window is just for setup/settings. See
    // apis/bundling-cef. `exitOnLastWindowClosed:false` (above) keeps the tray alive when the window closes.
    mac: { bundleCEF: true, defaultRenderer: "cef" },
    linux: { bundleCEF: true, defaultRenderer: "cef" },
    // The Windows app/taskbar/shortcut icon (packaged build). The tray icon is set separately at runtime.
    win: { bundleCEF: true, defaultRenderer: "cef", icon: "assets/icon.ico" },
  },
} satisfies ElectrobunConfig;
