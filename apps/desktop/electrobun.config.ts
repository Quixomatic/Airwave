import type { ElectrobunConfig } from "electrobun";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const CONFIG_DIR = dirname(fileURLToPath(import.meta.url)); // apps/desktop

// The built admin (apps/web) + tv-web (apps/tv-web) SPAs, copied into the bundle so the supervisor can serve
// them on local ports. Built by `pnpm -F desktop prebuild` before `electrobun build`.
const adminDist = "../web/dist";
const tvwebDist = "../tv-web/dist";
const setupUiDist = "../desktop-setup/dist";

// The self-contained server (v0.9.107): `apps/server build:standalone` → dist/standalone/{server.mjs, migrate.mjs}.
// Prisma is engine-less (pg driver adapter), so `server.mjs` runs with zero node_modules; `migrate.mjs` applies
// the migration SQL directly. The supervisor's PACKAGED branch runs them from Resources/app/server/.
const serverStandalone = "../server/dist/standalone";
// The Prisma migration SQL the engine-less runner applies (server/migrations/<name>/migration.sql at runtime).
const migrationsDir = "../../packages/db/prisma/migrations";

// ── Embedded Postgres — ship the pre-bundled wrapper + ONLY the current platform's binary package ───────────
// `build:pg-launcher` bundles the `embedded-postgres` wrapper (+ `pg`, `async-exit-hook`) into a single
// `pg-launcher/pg-launcher.mjs`, leaving the 8 `@embedded-postgres/<platform>` binary packages external. We
// copy that file to `pg/pg-launcher.mjs` and the current platform's binary package to
// `pg/node_modules/@embedded-postgres/<platform>`, so the launcher's runtime `import('@embedded-postgres/…')`
// resolves from the adjacent node_modules. (We can't import the wrapper into the supervisor directly —
// electrobun's bundler can't resolve node_modules deps at build time; hence the separate pre-bundle.)

/** The `@embedded-postgres/<platform>` binary package for THIS build host (each CI runner builds its own OS/arch;
 * pnpm only installs the matching optional dep). */
function pgPlatformPkg(): string {
  const map: Record<string, string> = {
    "darwin-arm64": "@embedded-postgres/darwin-arm64",
    "darwin-x64": "@embedded-postgres/darwin-x64",
    "linux-arm": "@embedded-postgres/linux-arm",
    "linux-arm64": "@embedded-postgres/linux-arm64",
    "linux-ia32": "@embedded-postgres/linux-ia32",
    "linux-ppc64": "@embedded-postgres/linux-ppc64",
    "linux-x64": "@embedded-postgres/linux-x64",
    "win32-x64": "@embedded-postgres/windows-x64",
  };
  const key = `${process.platform}-${process.arch}`;
  const pkg = map[key];
  if (!pkg) throw new Error(`[electrobun.config] no @embedded-postgres binary package for ${key}`);
  return pkg;
}

// Realpath the platform pkg's real directory (pnpm links it via a symlink electrobun's copy may not follow),
// then make it RELATIVE to the config dir — electrobun concatenates the copy-source key onto the app dir, so
// an absolute path gets mangled. Resolve it FROM embedded-postgres's own context so pnpm's sibling layout works.
const epPkg = pgPlatformPkg();
const epRequire = createRequire(require.resolve("embedded-postgres/package.json"));
const epPlatformDir = relative(CONFIG_DIR, realpathSync(dirname(epRequire.resolve(`${epPkg}/package.json`))));
// Ship the heavy native binaries SHALLOW (pg/native) — NOT under the deep node_modules/@embedded-postgres/…
// path, whose >100-char entries make the tar writer emit PAX/long-name records electrobun's self-extractor
// can't read (TarUnsupportedFileType → installer aborts). A generated stub (build-pg.ts) bridges the import.
const epNativeDir = join(epPlatformDir, "native");

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
      // The engine-less server bundle (server.mjs + migrate.mjs) + the migration SQL it applies.
      [serverStandalone]: "server",
      [migrationsDir]: "server/migrations",
      // Embedded Postgres, laid out for SHORT tar paths (see epNativeDir note):
      //  • the wrapper bundle → pg/pg-launcher.mjs
      //  • the native binaries SHALLOW → pg/native/{bin,lib,share}
      //  • a tiny stub platform package → pg/node_modules/@embedded-postgres/<platform> (points at pg/native/bin)
      "pg-launcher/pg-launcher.mjs": "pg/pg-launcher.mjs",
      [epNativeDir]: "pg/native",
      [`pg-launcher/stub/${epPkg}`]: `pg/node_modules/${epPkg}`,
      // Source assets (tray icon, …) so the bundle can resolve `views://assets/*` at runtime.
      assets: "views/assets",
    },
    watchIgnore: [`${adminDist}/**`, `${tvwebDist}/**`, `${setupUiDist}/**`, `${serverStandalone}/**`, "pg-launcher/**"],
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
