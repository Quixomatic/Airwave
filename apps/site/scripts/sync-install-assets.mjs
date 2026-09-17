// Copies the one-line installer assets into apps/site/public so they're served as static files at
// getairwave.tv/install.sh, /install.ps1, and /docker-compose.yml. Single source of truth stays the repo
// root (scripts/install.sh, scripts/install.ps1, docker-compose.yml); these public copies are derived +
// gitignored. Run from next.config.mjs (fires on every dev/build, including Vercel) and standalone
// (`node scripts/sync-install-assets.mjs`).
//
// The compose copy has its project name rewritten channelguide -> airwave, matched-line only, so installs
// created through the script show as the "airwave" stack while the canonical repo compose is untouched.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../.."); // apps/site/scripts -> repo root
const PUBLIC = resolve(HERE, "../public");

/** [sourcePath, publicName, transform?] */
const ASSETS = [
  [resolve(ROOT, "scripts/install.sh"), "install.sh"],
  [resolve(ROOT, "scripts/install.ps1"), "install.ps1"],
  [
    resolve(ROOT, "docker-compose.yml"),
    "docker-compose.yml",
    (text) => text.replace(/^name: channelguide$/m, "name: airwave"),
  ],
];

export function syncInstallAssets() {
  mkdirSync(PUBLIC, { recursive: true });
  for (const [src, name, transform] of ASSETS) {
    try {
      let text = readFileSync(src, "utf8");
      // Serve scripts with LF endings regardless of the checkout (Windows CRLF would break `sh`/curl piping).
      if (name.endsWith(".sh")) text = text.replace(/\r\n?/g, "\n");
      if (transform) text = transform(text);
      writeFileSync(resolve(PUBLIC, name), text);
      console.log(`[sync-install-assets] wrote public/${name}`);
    } catch (e) {
      // Never break the site build over a missing installer asset — just skip it.
      console.warn(`[sync-install-assets] ${src} not found; skipping. (${e.message})`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("sync-install-assets.mjs")) {
  syncInstallAssets();
}
