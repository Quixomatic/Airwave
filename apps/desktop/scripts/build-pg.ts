/**
 * Builds the packaged embedded-Postgres pieces:
 *   1. `pg-launcher/pg-launcher.mjs` — the embedded-postgres wrapper (+ pg + async-exit-hook) bundled into one
 *      file, the 8 `@embedded-postgres/<platform>` binary packages left external (loaded at runtime).
 *   2. `pg-launcher/stub/@embedded-postgres/<platform>/` — a TINY stub of the platform binary package whose
 *      `dist/index.js` points at a SHALLOW `pg/native/bin` (four levels up), instead of the real package's
 *      own `../native`.
 *
 * WHY the stub: the real `@embedded-postgres/<platform>` package nests its ~1700 binary files under
 * `pg/node_modules/@embedded-postgres/windows-x64/native/…`. Those paths exceed 100 chars, so the tar writer
 * emits PAX/long-name entries — which electrobun's own Zig self-extractor cannot read (`error:
 * TarUnsupportedFileType`), aborting the installer mid-extract. Shipping `native/` at a shallow `pg/native/`
 * (via electrobun.config) keeps every path short → classic ustar → the extractor is happy. The stub bridges
 * embedded-postgres's `import('@embedded-postgres/<platform>')` to those relocated binaries.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url)); // apps/desktop/scripts
const APP = join(HERE, ".."); // apps/desktop
const OUT = join(APP, "pg-launcher"); // build output (gitignored)

const EP_PLATFORM_PKGS = [
  "@embedded-postgres/darwin-arm64",
  "@embedded-postgres/darwin-x64",
  "@embedded-postgres/linux-arm",
  "@embedded-postgres/linux-arm64",
  "@embedded-postgres/linux-ia32",
  "@embedded-postgres/linux-ppc64",
  "@embedded-postgres/linux-x64",
  "@embedded-postgres/windows-x64",
];

/** The `@embedded-postgres/<platform>` package name for this build host. */
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
  if (!pkg) throw new Error(`[build-pg] no @embedded-postgres binary package for ${key}`);
  return pkg;
}

const epPkg = pgPlatformPkg();
const ext = process.platform === "win32" ? ".exe" : "";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. Bundle the launcher (wrapper + pg + async-exit-hook; platform binary packages external).
const externals = EP_PLATFORM_PKGS.flatMap((p) => ["--external", p]);
const r = spawnSync(
  "bun",
  ["build", join(APP, "src", "pg-launcher.ts"), "--target=bun", ...externals, "--outfile", join(OUT, "pg-launcher.mjs")],
  { stdio: "inherit", shell: process.platform === "win32" },
);
if (r.status !== 0) {
  console.error(`[build-pg] pg-launcher bundle failed (exit ${r.status})`);
  process.exit(r.status ?? 1);
}

// 2. Generate the stub platform package → pg-launcher/stub/@embedded-postgres/<platform>/.
//    dist/index.js resolves the binaries from `pg/native/bin` (four levels up from the stub's dist/ — see the
//    bundle layout the electrobun.config copy produces: pg/node_modules/@embedded-postgres/<platform>/dist).
const stubDir = join(OUT, "stub", epPkg);
mkdirSync(join(stubDir, "dist"), { recursive: true });
writeFileSync(
  join(stubDir, "package.json"),
  JSON.stringify({ name: epPkg, version: "0.0.0-stub", type: "module", exports: "./dist/index.js" }, null, 2),
);
writeFileSync(
  join(stubDir, "dist", "index.js"),
  `import path from 'path';
import { fileURLToPath } from 'url';
// Stub for ${epPkg}: the real native binaries are shipped SHALLOW at pg/native/ (not under this package) so the
// bundle's tar paths stay short enough for electrobun's self-extractor. See apps/desktop/scripts/build-pg.ts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bin = path.resolve(__dirname, '..', '..', '..', '..', 'native', 'bin');
export const pg_ctl = path.join(bin, 'pg_ctl${ext}');
export const initdb = path.join(bin, 'initdb${ext}');
export const postgres = path.join(bin, 'postgres${ext}');
`,
);

// 3. Windows: bundle the MSVC runtime app-local so a clean box (no / older VC++ redistributable) can run the
//    Postgres binaries. PG18's initdb/postgres link vcruntime140_1.dll (only in the VS2019+ redist); without it
//    the child dies at initdb "post-bootstrap initialization" with 0xC0000005, or won't start at all. Windows
//    searches the exe's own dir first, so dropping these next to postgres.exe fixes it with no install/reboot.
//    (Issue #42. They're Microsoft-redistributable; the windows-2025 CI runner has them in System32.)
if (process.platform === "win32") {
  const req = createRequire(import.meta.url);
  const epReq = createRequire(req.resolve("embedded-postgres/package.json"));
  const nativeBin = join(realpathSync(dirname(epReq.resolve(`${epPkg}/package.json`))), "native", "bin");
  const sys32 = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  for (const dll of ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"]) {
    const src = join(sys32, dll);
    if (existsSync(src)) {
      copyFileSync(src, join(nativeBin, dll));
      console.log(`[build-pg] bundled ${dll} → pg/native/bin`);
    } else {
      // Fail LOUDLY rather than ship an installer that crashes on a clean box (issue #42). windows-2025 CI has
      // these; if a runner ever doesn't, install the VC++ 2015-2022 x64 redistributable on the build host, or
      // switch this to a vendored copy under apps/desktop.
      console.error(`[build-pg] FATAL: ${src} not found. The Windows build needs the MSVC runtime to bundle it (issue #42).`);
      process.exit(1);
    }
  }
}

console.log(`[build-pg] built pg-launcher.mjs + stub for ${epPkg} (binaries → pg/native/bin)`);
