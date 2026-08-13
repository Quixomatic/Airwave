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
    // The setup/settings window uses the SYSTEM webview (WebView2 / WKWebView / WebKitGTK), NOT bundled CEF.
    // Per the docs, the system webview is the right fit for a simple app (~14MB vs ~100MB CEF) — and bundled
    // CEF on Windows SEGFAULTED on window reuse (show()/activate() a hidden window), which broke reopening the
    // settings window. The native webview + the documented show()/hide() reuse pattern is stable. The running
    // app is still tray-first (browser = the admin/tv-web UI); the window is only for setup/settings.
    // (Linux: the docs prefer CEF for advanced compositing — a plain form is fine on GTKWebKit; revisit at
    // Stage-5 packaging if needed.)
    mac: { bundleCEF: false, defaultRenderer: "native" },
    linux: { bundleCEF: false, defaultRenderer: "native" },
    // `icon` = the Windows app/taskbar/shortcut icon (packaged build). The tray icon is set at runtime.
    win: { bundleCEF: false, defaultRenderer: "native", icon: "assets/icon.ico" },
  },
} satisfies ElectrobunConfig;
