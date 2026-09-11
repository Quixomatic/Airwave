#!/usr/bin/env node
/**
 * package-tizen — package the built `dist/` into a SIGNED Samsung/Tizen `.wgt` in `build-wgt/`.
 *
 * Run via `pnpm --filter tv-web package:tizen` (which builds first). This step locates the Tizen CLI
 * (`tizen`, from Tizen Studio), then signs + packages dist/ with a security profile.
 *
 * Unlike webOS's unsigned IPK, Tizen requires a signed package, and Samsung TVs require a Samsung
 * distributor certificate that embeds each target TV's DUID. Create that ONCE in Tizen Studio's
 * Certificate Manager (Samsung > TV), with the TV in Developer Mode, then pass the profile name here:
 *
 *   pnpm --filter tv-web package:tizen -- --profile <yourProfileName>
 *   # or set TIZEN_PROFILE=<name> in the environment
 *
 * The output is renamed to include the version (Airwave_<version>.wgt); the version comes from
 * public/config.xml, kept in lockstep by `pnpm version:bump`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(APP_DIR, "dist");
const OUT = join(APP_DIR, "build-wgt");
const WIN = process.platform === "win32";

const die = (msg) => {
  console.error(`\n\u2716 ${msg}\n`);
  process.exit(1);
};

if (!existsSync(join(DIST, "config.xml"))) {
  die(`No build found at ${DIST} (missing config.xml). Run the build first (\`pnpm --filter tv-web build\`).`);
}

// Signing profile: `--profile <name>` / `--profile=<name>`, else $TIZEN_PROFILE.
const argv = process.argv.slice(2);
let profile = process.env.TIZEN_PROFILE || "";
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--profile" && argv[i + 1]) profile = argv[i + 1];
  else if (argv[i].startsWith("--profile=")) profile = argv[i].slice("--profile=".length);
}
if (!profile) {
  die(
    "No signing profile. Samsung TVs need a signed .wgt from a Samsung certificate (with your TV's DUID),\n" +
      "created once in Tizen Studio > Certificate Manager (Samsung > TV) with the TV in Developer Mode.\n" +
      "Then: pnpm --filter tv-web package:tizen -- --profile <yourProfileName>   (or set TIZEN_PROFILE).",
  );
}

/** Locate a runnable `tizen` CLI: PATH first, then the Tizen Studio default install. */
function findTizen() {
  const runnable = (bin) => {
    try {
      return spawnSync(bin, ["version"], { shell: true, stdio: "ignore" }).status === 0;
    } catch {
      return false;
    }
  };
  if (runnable("tizen")) return "tizen";
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const candidates = WIN
    ? [
        "C:/tizen-studio/tools/ide/bin/tizen.bat",
        home && join(home, "tizen-studio/tools/ide/bin/tizen.bat"),
      ]
    : [
        home && join(home, "tizen-studio/tools/ide/bin/tizen"),
        "/opt/tizen-studio/tools/ide/bin/tizen",
      ];
  for (const cand of candidates) if (cand && existsSync(cand) && runnable(`"${cand}"`)) return `"${cand}"`;
  die(
    "tizen CLI not found. Install Tizen Studio (with the Samsung TV extensions), or add its\n" +
      "tools/ide/bin to PATH, then re-run.",
  );
}

const tizen = findTizen();
const version = readFileSync(join(DIST, "config.xml"), "utf8").match(/version="(\d+\.\d+\.\d+)"/)?.[1] ?? "unknown";
console.log(`\nPackaging Tizen .wgt (profile "${profile}")  ->  build-wgt/Airwave_${version}.wgt\n`);

// Sign + package dist/ into a .wgt. shell:true so a resolved .bat runs on Windows.
const r = spawnSync(tizen, ["package", "-t", "wgt", "-s", profile, "-o", `"${OUT}"`, "--", `"${DIST}"`], {
  shell: true,
  stdio: "inherit",
});
if (r.status !== 0) die(`tizen package failed (exit ${r.status ?? "unknown"}).`);

// tizen names the artifact from the widget <name> (Airwave.wgt); rename to include the version.
const wgts = readdirSync(OUT)
  .filter((f) => f.endsWith(".wgt") && !/_\d+\.\d+\.\d+\.wgt$/.test(f))
  .map((f) => ({ f, m: statSync(join(OUT, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m);
if (wgts[0]) {
  const versioned = `Airwave_${version}.wgt`;
  renameSync(join(OUT, wgts[0].f), join(OUT, versioned));
  console.log(`\n\u2713 Done. build-wgt/${versioned}\n`);
} else {
  console.log(`\n\u2713 Done (see build-wgt/).\n`);
}
