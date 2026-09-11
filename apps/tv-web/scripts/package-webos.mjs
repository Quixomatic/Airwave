#!/usr/bin/env node
/**
 * package-webos — package the built `dist/` into a versioned webOS IPK in `build-ipk/`.
 *
 * Run via `pnpm --filter tv-web package:webos` (which builds first). This step just locates the ares CLI
 * (`ares-package`, from @webosose/ares-cli or the LG webOS TV SDK) and runs it. ares names the artifact
 * from appinfo.json — `com.airwave.tv_<version>_all.ipk` — so the output is automatically versioned; the
 * version is whatever `pnpm version:bump` last wrote into `public/appinfo.json` (copied to dist on build).
 *
 * `--no-minify` is deliberate: webOS's packager minifier has mangled our bundle before (already minified by
 * Vite), so we skip it and ship Vite's output as-is.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(APP_DIR, "dist");
const OUT = join(APP_DIR, "build-ipk");
const WIN = process.platform === "win32";

const die = (msg) => {
  console.error(`\n\u2716 ${msg}\n`);
  process.exit(1);
};

if (!existsSync(join(DIST, "appinfo.json"))) {
  die(`No build found at ${DIST} (missing appinfo.json). Run the build first (\`pnpm --filter tv-web build\`).`);
}

/** Locate an `ares-package` we can actually run: PATH first, then the npm global bin, then the LG SDK. */
function findAres() {
  const runnable = (bin) => {
    try {
      return spawnSync(bin, ["--version"], { shell: true, stdio: "ignore" }).status === 0;
    } catch {
      return false;
    }
  };
  // 1) On PATH (the common case — @webosose/ares-cli installed globally).
  if (runnable("ares-package")) return "ares-package";
  // 2) npm global bin.
  try {
    const prefix = spawnSync("npm", ["config", "get", "prefix"], { shell: true, encoding: "utf8" }).stdout?.trim();
    if (prefix) {
      const cand = WIN ? join(prefix, "ares-package.cmd") : join(prefix, "bin", "ares-package");
      if (existsSync(cand) && runnable(`"${cand}"`)) return `"${cand}"`;
    }
  } catch {
    /* npm not found — fall through */
  }
  // 3) LG webOS TV SDK default install.
  const sdk = WIN
    ? ["C:/Program Files/LG Electronics/webOS_TV_SDK/CLI/bin/ares-package.cmd"]
    : ["/opt/webOS_TV_SDK/CLI/bin/ares-package", `${process.env.HOME}/webOS_TV_SDK/CLI/bin/ares-package`];
  for (const cand of sdk) if (existsSync(cand) && runnable(`"${cand}"`)) return `"${cand}"`;
  die(
    "ares-package not found. Install the webOS CLI: `npm i -g @webosose/ares-cli` (or install the LG webOS TV SDK), then re-run.",
  );
}

const ares = findAres();
const version = JSON.parse(readFileSync(join(DIST, "appinfo.json"), "utf8")).version;
console.log(`\nPackaging webOS IPK  ->  build-ipk/com.airwave.tv_${version}_all.ipk\n`);

// ares-package <dist> -o <outdir> --no-minify. shell:true so the resolved .cmd runs on Windows.
const r = spawnSync(ares, [`"${DIST}"`, "-o", `"${OUT}"`, "--no-minify"], { shell: true, stdio: "inherit" });
if (r.status !== 0) die(`ares-package failed (exit ${r.status ?? "unknown"}).`);
console.log(`\n\u2713 Done. build-ipk/com.airwave.tv_${version}_all.ipk\n`);
