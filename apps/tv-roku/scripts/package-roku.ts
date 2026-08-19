/**
 * package-roku — build, sideload, SIGN, and download a Channel-Store-ready .pkg.
 *
 *   pnpm -F tv-roku package        (runs `bsc` first, then this — see package.json)
 *
 * Assumes `bsc` has already transpiled the app into out/staging (the `package` npm script chains it).
 * Then it drives roku-deploy's deployAndSignPackage against the Roku in rokudeploy.json: it zips staging,
 * sideloads it, signs the installed channel with your signingPassword, and downloads the signed .pkg —
 * which you upload to the Roku Developer Dashboard.
 *
 * Prereqs:
 *   • `pnpm -F tv-roku genkey` has been run once (rokudeploy.json has signingPassword + devId).
 *   • The Roku is awake + in Developer Mode and reachable at rokudeploy.json `host`.
 *
 * The signed package lands at out/airwave-<version>.pkg (version read from the manifest).
 */
import { rokuDeploy } from "roku-deploy";
import { copyFileSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(APP, "rokudeploy.json"), "utf8"));

if (!cfg.signingPassword) {
  console.error(
    "\n✗ No signingPassword in rokudeploy.json. Run `pnpm -F tv-roku genkey` once first to generate this\n" +
      "  device's signing key (one time, ever — save the password!).\n",
  );
  process.exit(1);
}

/** Read major/minor/build from the manifest → "0.10.62". */
function manifestVersion(): string {
  const m = readFileSync(join(APP, "manifest"), "utf8");
  const g = (k: string) => new RegExp(`^${k}=(\\d+)`, "m").exec(m)?.[1] ?? "0";
  return `${g("major_version")}.${g("minor_version")}.${g("build_version")}`;
}

async function main() {
  const version = manifestVersion();
  console.log(`Airwave Roku v${version} → Roku ${cfg.host}: package + sign…`);
  console.log("  (zip staging → sideload → sign with your key → download signed .pkg)\n");

  // deployAndSignPackage uses rootDir/outDir/outFile/files/host/password from cfg + signingPassword to sign.
  // It returns the local path of the downloaded signed .pkg (out/<outFile-basename>.pkg).
  const signedPkg = await rokuDeploy.deployAndSignPackage({
    ...cfg,
    rootDir: join(APP, cfg.rootDir),
    outDir: join(APP, cfg.outDir),
  });

  // Give it a versioned name alongside the default, so successive builds don't overwrite each other.
  const versioned = join(APP, cfg.outDir, `airwave-${version}.pkg`);
  copyFileSync(signedPkg, versioned);
  const kb = (statSync(versioned).size / 1024).toFixed(0);

  console.log("━".repeat(72));
  console.log(`  ✅  Signed package ready:  ${versioned}  (${kb} KB)`);
  console.log("━".repeat(72));
  console.log("  Upload this .pkg at developer.roku.com → your channel → Package Upload.");
  console.log("  Reminder: the Channel Store version shown to users comes from the manifest");
  console.log(`  (currently ${version}) — bump it (via /version-bump) before re-packaging an update.\n`);
}

main().catch((e) => {
  console.error(`\n✗ packaging failed: ${e?.message ?? e}\n`);
  process.exit(1);
});
