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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
