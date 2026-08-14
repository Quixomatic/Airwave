/**
 * Build the branded Windows installer (Inno Setup) from electrobun's already-built app bundle.
 *
 * electrobun 1.18.1 only produces a bare self-extracting stub (a console with DEBUG spew). This takes the SAME
 * files electrobun would drop and packages them into a real wizard + uninstaller (installer/airwave.iss). No
 * electrobun self-extractor at runtime — the app content is just files, laid down directly.
 *
 * Prereq: `electrobun build` has produced build/<env>-win-x64/Airwave-Setup.tar.zst. Run: `bun scripts/build-win-installer.ts`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), ".."); // apps/desktop
const version = (JSON.parse(readFileSync(join(APP, "package.json"), "utf8")) as { version: string }).version;

// electrobun writes the tarball under build/stable-win-x64 (or dev/canary). Prefer stable.
const tarZst = ["stable", "canary", "dev"]
  .map((env) => join(APP, "build", `${env}-win-x64`, "Airwave-Setup.tar.zst"))
  .find(existsSync);
if (!tarZst) {
  console.error("[installer] no Airwave-Setup.tar.zst found — run `electrobun build` first.");
  process.exit(1);
}

// Staleness guard: this script only REPACKAGES the last `electrobun build` output — it does NOT rebuild the app.
// If the freshly-built SPA/server output is newer than that bundle, the installer would ship a STALE admin UI
// (this bit us once: the Plex-only login change wasn't in a locally-repackaged installer). CI always runs
// prebuild → electrobun build → this in order, so the bundle is newest there and this never fires. Locally,
// warn loudly so you re-run the build first. (Warn, don't fail — timestamps can be odd across environments.)
const tarMtime = statSync(tarZst).mtimeMs;
const freshnessProbes = [
  "../web/dist/index.html",
  "../tv-web/dist/index.html",
  "../desktop-setup/dist/index.html",
  "../server/dist/standalone/server.mjs",
].map((p) => join(APP, p));
const staleAgainst = freshnessProbes.filter((p) => existsSync(p) && statSync(p).mtimeMs > tarMtime);
if (staleAgainst.length) {
  console.warn("\n[installer] ⚠️  STALE BUNDLE — the electrobun output is OLDER than freshly-built app output:");
  for (const p of staleAgainst) console.warn(`               • ${relative(APP, p)} is newer than the bundled ${relative(APP, tarZst)}`);
  console.warn("             The installer would package an OUT-OF-DATE app. Rebuild the bundle first:");
  console.warn("               pnpm -F desktop prebuild && pnpm -F desktop build:stable\n");
}

const staging = join(APP, "build", "inno-src");
const outDir = join(APP, "build", "inno");
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(outDir, { recursive: true });

// 1. Decompress the .zst → staging/_bundle.tar, then extract with a RELATIVE name (cwd = staging, no `-C`) so
//    no argument carries a `C:\…` drive-colon — git's GNU tar (often first on the Windows PATH) reads a leading
//    `C:` as a remote host and fails. Works with GNU tar and bsdtar.
console.log(`[installer] extracting electrobun bundle from ${tarZst} …`);
const tarPath = join(staging, "_bundle.tar");
writeFileSync(tarPath, Bun.zstdDecompressSync(readFileSync(tarZst)));
const ex = spawnSync("tar", ["-xf", "_bundle.tar"], { cwd: staging, stdio: "inherit", shell: process.platform === "win32" });
rmSync(tarPath, { force: true });
if (ex.status !== 0) {
  console.error("[installer] tar extraction failed.");
  process.exit(ex.status ?? 1);
}

const srcDir = join(staging, "Airwave");
if (!existsSync(join(srcDir, "bin", "launcher.exe"))) {
  console.error(`[installer] extracted bundle missing at ${srcDir}`);
  process.exit(1);
}

// 2. Locate ISCC (local winget/choco install vs the CI runner's choco path).
const iscc =
  [
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Inno Setup 6", "ISCC.exe"),
    "C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe",
    "C:\\Program Files\\Inno Setup 6\\ISCC.exe",
  ].find(existsSync) ?? "ISCC.exe";

// 3. Compile installer/airwave.iss → build/inno/Airwave-Setup.exe.
console.log(`[installer] compiling with ${iscc} (v${version}) …`);
const r = spawnSync(
  iscc,
  [
    `/DMyAppVersion=${version}`,
    `/DSrcDir=${srcDir}`,
    `/DOutputDir=${outDir}`,
    `/DIconFile=${join(APP, "assets", "icon.ico")}`,
    join(APP, "installer", "airwave.iss"),
  ],
  { stdio: "inherit" },
);
if (r.status !== 0) {
  console.error(`[installer] ISCC failed (exit ${r.status}).`);
  process.exit(r.status ?? 1);
}
console.log(`[installer] ✅ built ${join(outDir, "Airwave-Setup.exe")}`);
