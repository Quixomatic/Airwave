/**
 * package-roku — build, sideload, SIGN, and download a Channel-Store-ready .pkg.
 *
 *   pnpm -F tv-roku package        (runs `bsc` first, then this — see package.json)
 *
 * Assumes `bsc` has already transpiled the app into out/staging (the `package` npm script chains it).
 * Then, against the Roku in rokudeploy.json: it zips staging + sideloads (roku-deploy `deploy`), converts
 * the installed channel to **squashfs** (required by the Channel Store), and **signs** it on-device with
 * your signingPassword (roku-deploy `signExistingPackage`). Finally it downloads the signed .pkg with
 * **curl** — NOT roku-deploy's own downloader.
 *
 * ⚠️ WHY curl instead of roku-deploy's deployAndSignPackage/retrieveSignedPackage: roku-deploy 3.18.2
 *   swapped its HTTP layer to a `needle` shim whose streaming GET decodes the BINARY .pkg as UTF-8 — every
 *   high byte collapses to U+FFFD (ef bf bd), corrupting ~1/4 of the file. The device signs a perfect
 *   package; roku-deploy mangles it on download → the dashboard rejects it as "channel package is
 *   malformed". curl (digest auth, binary) is what the manual "download the purple link" step does, and is
 *   what our grab-screenshot script already uses reliably.
 *
 * Prereqs:
 *   • `pnpm -F tv-roku genkey` has been run once (rokudeploy.json has signingPassword + devId).
 *   • The Roku is awake + in Developer Mode, and (for signing) LINKED to your Roku account + online.
 *
 * The signed package lands at out/airwave-<version>.pkg (version read from the manifest).
 */
import { rokuDeploy } from "roku-deploy";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(APP, "rokudeploy.json"), "utf8"));
const HOST = cfg.host;
const USER = cfg.username || "rokudev";
const PASS = cfg.password;

if (!cfg.signingPassword) {
  console.error(
    "\n✗ No signingPassword in rokudeploy.json. Run `pnpm -F tv-roku genkey` once first to generate this\n" +
      "  device's signing key (one time, ever — save the password!).\n",
  );
  process.exit(1);
}

/** Read major/minor/build from the manifest → "0.10.64". */
function manifestVersion(): string {
  const m = readFileSync(join(APP, "manifest"), "utf8");
  const g = (k: string) => new RegExp(`^${k}=(\\d+)`, "m").exec(m)?.[1] ?? "0";
  return `${g("major_version")}.${g("minor_version")}.${g("build_version")}`;
}

/** Count 0xEF 0xBF 0xBD (UTF-8 replacement char) triples — the fingerprint of a UTF-8-mangled binary. */
function replacementCharCount(buf: Buffer): number {
  let n = 0;
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === 0xef && buf[i + 1] === 0xbf && buf[i + 2] === 0xbd) n++;
  }
  return n;
}

async function main() {
  const version = manifestVersion();
  // Compression = package FORMAT → minimum-firmware floor on the dashboard:
  //   ZIP → v5.2 · CRAMFS → v7.7 · SQUASHFS → v8.0 · SQUASHFS_ZSTD → v11.0.
  // DECISION (James): ship SQUASHFS_ZSTD (the latest, smallest format) and set the listing's Minimum
  // Firmware to v11.0.0 b1. Our audience is 4K HDR boxes, which all run OS 11+, and v11 lets us use the
  // full modern API surface (e.g. the memory-monitoring calls) unguarded. roku-deploy's convertToSquashfs
  // produces the zstd variant on modern firmware, which is exactly what we want. (The earlier "malformed"
  // was the download corruption, since fixed via curl — unrelated to the format.)
  const squashfs = cfg.convertToSquashfs ?? true;
  const opts = {
    ...cfg,
    convertToSquashfs: squashfs,
    retainStagingDir: true, // signExistingPackage reads the manifest from staging for the app name
    rootDir: join(APP, cfg.rootDir),
    outDir: join(APP, cfg.outDir),
  };

  console.log(`Airwave Roku v${version} → Roku ${HOST}: package + sign…`);
  console.log(`  (zip staging → sideload → ${squashfs ? "squashfs → " : ""}sign → curl-download signed .pkg)\n`);

  process.stdout.write("  · sideloading… ");
  await rokuDeploy.deploy(opts);
  console.log("ok");

  if (squashfs) {
    process.stdout.write("  · converting to squashfs… ");
    await rokuDeploy.convertToSquashfs(opts);
    console.log("ok");
  }

  process.stdout.write("  · signing on-device… ");
  const remotePkgPath = await rokuDeploy.signExistingPackage(opts); // e.g. "pkgs/Airwave_....pkg"
  console.log(`ok (${remotePkgPath})`);

  // Download the signed pkg with curl (binary-safe digest auth) — the roku-deploy downloader corrupts it.
  const versioned = join(APP, cfg.outDir, `airwave-${version}.pkg`);
  process.stdout.write("  · downloading (curl, binary)… ");
  const code = execFileSync("curl", [
    "-sS", "--digest", "-u", `${USER}:${PASS}`, "-m", "60",
    "-o", versioned, "-w", "%{http_code}",
    `http://${HOST}/${remotePkgPath.replace(/^\/+/, "")}`,
  ]).toString().trim();
  console.log(`HTTP ${code}`);
  if (code !== "200") {
    console.error(`\n✗ download failed (HTTP ${code}).\n`);
    process.exit(1);
  }

  // Verify it's a real signed package and NOT UTF-8-corrupted.
  const buf = readFileSync(versioned);
  const header = buf.subarray(0, 16).toString("latin1");
  const bad = replacementCharCount(buf);
  const kb = (buf.length / 1024).toFixed(0);
  if (!header.startsWith("Roku Channel Pak")) {
    console.error(`\n✗ not a signed package (header: ${JSON.stringify(header)}). Is the device linked + online?\n`);
    process.exit(1);
  }
  if (bad > 100) {
    console.error(`\n✗ downloaded package is CORRUPTED (${bad} U+FFFD bytes). The download mangled the binary.\n`);
    process.exit(1);
  }

  console.log("━".repeat(72));
  console.log(`  ✅  Signed package ready:  ${versioned}  (${kb} KB, clean binary)`);
  console.log("━".repeat(72));
  console.log("  Upload at developer.roku.com → your channel → Package Upload. Minimum Firmware: v11.0.0 b1.");
  console.log(`  Store version comes from the manifest (${version}) — bump before re-packaging an update.\n`);
}

main().catch((e) => {
  console.error(`\n✗ packaging failed: ${e?.message ?? e}\n`);
  process.exit(1);
});
