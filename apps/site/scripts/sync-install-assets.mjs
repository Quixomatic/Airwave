// Copies the one-line installer assets into apps/site/public so they're served as static files at
// getairwave.tv/install.sh, /install.ps1, and /docker-compose.yml. Single source of truth stays the repo
// root (scripts/install.sh, scripts/install.ps1, docker-compose.yml); these public copies are derived +
// gitignored. Run from next.config.mjs (fires on every dev/build, including Vercel) and standalone
// (`node scripts/sync-install-assets.mjs`).
//
// Each served copy gets a `# airwave-build: <sha> <iso>` marker injected at the top so you can verify what
// Vercel is serving:  curl -fsSL https://www.getairwave.tv/install.sh | grep airwave-build
// (compare the sha to `git rev-parse HEAD`).
//
// The compose copy also has its project name rewritten channelguide -> airwave, matched-line only, so installs
// created through the script show as the "airwave" stack while the canonical repo compose is untouched.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../.."); // apps/site/scripts -> repo root
const PUBLIC = resolve(HERE, "../public");

/** Short commit sha: Vercel's build env first, then local git, then "unknown". */
function commitSha() {
  const env = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (env) return env.slice(0, 12);
  try {
    return execSync("git rev-parse --short=12 HEAD", { cwd: ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

/** Inject the build marker: after the shebang for .sh, at the very top for .ps1 / .yml. */
function withMarker(name, text, marker) {
  const line = `# ${marker}`;
  if (name.endsWith(".sh") && text.startsWith("#!")) {
    const nl = text.indexOf("\n");
    return text.slice(0, nl + 1) + line + "\n" + text.slice(nl + 1);
  }
  return line + "\n" + text;
}

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
  const marker = `airwave-build: ${commitSha()} ${new Date().toISOString()}`;
  for (const [src, name, transform] of ASSETS) {
    try {
      let text = readFileSync(src, "utf8");
      // Serve scripts with LF endings regardless of the checkout (Windows CRLF would break `sh`/curl piping).
      if (name.endsWith(".sh")) text = text.replace(/\r\n?/g, "\n");
      if (transform) text = transform(text);
      text = withMarker(name, text, marker);
      writeFileSync(resolve(PUBLIC, name), text);
      console.log(`[sync-install-assets] wrote public/${name} (${marker})`);
    } catch (e) {
      // Never break the site build over a missing installer asset — just skip it.
      console.warn(`[sync-install-assets] ${src} not found; skipping. (${e.message})`);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("sync-install-assets.mjs")) {
  syncInstallAssets();
}
