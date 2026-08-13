import type { ElectrobunConfig } from "electrobun";

// The built admin (apps/web) + tv-web (apps/tv-web) SPAs, copied into the bundle so the supervisor can serve
// them on local ports. Built by `turbo -F web build && turbo -F tv-web build` before `electrobun build`.
const adminDist = "../web/dist";
const tvwebDist = "../tv-web/dist";

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
      // Source assets (tray icon, …) so the bundle can resolve `views://assets/*` at runtime.
      assets: "views/assets",
    },
    watchIgnore: [`${adminDist}/**`, `${tvwebDist}/**`],
    // No BrowserWindow → no CEF webview needed (much lighter). VERIFY: Electrobun is happy tray-only with
    // bundleCEF:false; if a webview is ever added (e.g. a settings window instead of the served /setup page),
    // flip these back on. See apis/bundling-cef.
    mac: { bundleCEF: false },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
