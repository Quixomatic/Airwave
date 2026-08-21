/**
 * Sign, DMG-package, notarize, and staple the macOS app — OURSELVES, outside electrobun.
 *
 * Why not electrobun's built-in `mac.codesign`/`notarize`? Its signer only walks Contents/MacOS + a *.node scan
 * under Resources/app/bun. Our .app embeds Postgres (postgres/initdb/pg_ctl + a stack of .dylibs) under
 * Contents/Resources/app/pg/native/ — electrobun never signs those, then notarizes anyway and Apple rejects the
 * unsigned nested binaries. So we do the whole thing here (mirrors scripts/build-win-installer.ts): sign EVERY
 * Mach-O leaf-first with the hardened runtime + entitlements, build the DMG, sign it, notarize (App Store Connect
 * API key), and staple.
 *
 * Prereq: `electrobun build` produced build/<env>-macos-<arch>/…/Airwave.app (with mac.createDmg=false, so no
 * unsigned electrobun DMG to fight). A Developer ID Application identity must be in a keychain (CI imports the
 * .p12). Run: `bun scripts/build-mac-signed.ts`.
 *
 * Env contract (set by CI from GitHub secrets):
 *   AIRWAVE_SIGN_IDENTITY   — the codesign identity, e.g. "Developer ID Application: Name (82L26MF2NR)".
 *                             Optional; if unset we derive the first Developer ID Application from the keychain.
 *   AIRWAVE_NOTARY_KEY      — path to the App Store Connect API .p8 key file.
 *   AIRWAVE_NOTARY_KEY_ID   — the key's Key ID.
 *   AIRWAVE_NOTARY_ISSUER   — the Issuer ID (UUID).
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  console.error("[mac-sign] this script only runs on macOS.");
  process.exit(1);
}

const APP = join(dirname(fileURLToPath(import.meta.url)), ".."); // apps/desktop
const version = (JSON.parse(readFileSync(join(APP, "package.json"), "utf8")) as { version: string }).version;
const arch = process.arch === "arm64" ? "arm64" : "x64";

// Small exec helper: array args (paths with spaces like "bun Helper.app" are common inside the bundle, so NEVER
// string-interpolate a shell command here) and inherited stdio for live logs.
function run(cmd: string, args: string[], opts: { capture?: boolean; cwd?: string } = {}): string {
  return execFileSync(cmd, args, {
    cwd: opts.cwd,
    encoding: "utf8",
    stdio: opts.capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 64 * 1024 * 1024,
  }) as unknown as string;
}

// ── 1. Locate the built .app ─────────────────────────────────────────────────────────────────────────────────
// electrobun writes to build/<env>-macos-<arch>/. Prefer stable. There can be more than one *.app (the plain app
// + the self-extracting wrapper); ship the PLAIN app — fully self-contained, every binary loose so we can sign
// it, cleanest Gatekeeper story (no runtime self-extraction of unsigned payload).
function findApps(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (name.endsWith(".app") && st.isDirectory()) out.push(p);
    else if (st.isDirectory()) out.push(...findApps(p));
  }
  return out;
}

const buildBase = ["stable", "canary", "dev"]
  .map((env) => join(APP, "build", `${env}-macos-${arch}`))
  .find(existsSync);
if (!buildBase) {
  console.error(`[mac-sign] no build/<env>-macos-${arch}/ dir — run \`electrobun build\` first.`);
  process.exit(1);
}
const apps = findApps(buildBase);
console.log(`[mac-sign] .app bundles found under ${buildBase}:`);
for (const a of apps) console.log(`   • ${a.replace(buildBase + "/", "")}`);
// The real app has Contents/Resources/app/server + pg (our supervisor payload). Prefer it; among matches, take
// the shallowest path (the plain bundle, not a wrapper's nested copy).
const appPath =
  apps
    .filter((a) => existsSync(join(a, "Contents", "Resources", "app", "server")) && existsSync(join(a, "Contents", "Resources", "app", "pg")))
    .sort((a, b) => a.split("/").length - b.split("/").length)[0] ?? apps.sort((a, b) => a.split("/").length - b.split("/").length)[0];
if (!appPath) {
  console.error("[mac-sign] no .app bundle found to sign.");
  process.exit(1);
}
console.log(`[mac-sign] signing: ${appPath}`);

// ── 2. Resolve the signing identity + notary creds ───────────────────────────────────────────────────────────
let identity = process.env.AIRWAVE_SIGN_IDENTITY?.trim();
if (!identity) {
  // Derive the first "Developer ID Application" identity present in the keychain search list.
  const found = run("security", ["find-identity", "-v", "-p", "codesigning"], { capture: true });
  identity = found.split("\n").find((l) => l.includes("Developer ID Application"))?.match(/"([^"]+)"/)?.[1];
}
if (!identity) {
  console.error("[mac-sign] no Developer ID Application identity (set AIRWAVE_SIGN_IDENTITY or import the cert).");
  process.exit(1);
}
console.log(`[mac-sign] identity: ${identity}`);

const notaryKey = process.env.AIRWAVE_NOTARY_KEY;
const notaryKeyId = process.env.AIRWAVE_NOTARY_KEY_ID;
const notaryIssuer = process.env.AIRWAVE_NOTARY_ISSUER;
if (!notaryKey || !notaryKeyId || !notaryIssuer || !existsSync(notaryKey)) {
  console.error("[mac-sign] missing notary creds (AIRWAVE_NOTARY_KEY[_ID]/AIRWAVE_NOTARY_ISSUER).");
  process.exit(1);
}

// ── 3. Entitlements (hardened runtime for a Bun app that JITs + spawns Postgres) ─────────────────────────────
const entitlements = join(APP, "build", "entitlements.mac.plist");
writeFileSync(
  entitlements,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
</dict>
</plist>
`,
);

// ── 4. Sign every Mach-O inside the bundle, LEAF-FIRST, then the bundle itself ────────────────────────────────
// Notarization requires every Mach-O (executables + dylibs) to carry a Developer ID signature + secure timestamp
// + hardened runtime. Walk the whole bundle, classify via `file`, sign deepest paths first so nested code is
// sealed before its container, and sign the .app last.
type MachO = { path: string; exe: boolean };
function findMachO(dir: string): MachO[] {
  const out: MachO[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      out.push(...findMachO(p));
    } else if (st.isFile()) {
      let desc = "";
      try {
        desc = run("file", ["-b", p], { capture: true });
      } catch {
        /* unreadable → skip */
      }
      if (desc.includes("Mach-O")) out.push({ path: p, exe: desc.includes("executable") });
      else if (p.endsWith(".dylib") || p.endsWith(".so")) out.push({ path: p, exe: false });
    }
  }
  return out;
}

const machos = findMachO(appPath).sort((a, b) => b.path.split("/").length - a.path.split("/").length);
console.log(`[mac-sign] signing ${machos.length} nested Mach-O binaries (leaf-first)…`);
for (const { path, exe } of machos) {
  const args = ["--force", "--timestamp", "--options", "runtime", "--sign", identity];
  if (exe) args.push("--entitlements", entitlements);
  args.push(path);
  try {
    run("codesign", args);
  } catch (err) {
    console.error(`[mac-sign] failed to sign ${path.replace(appPath + "/", "")}: ${(err as Error).message}`);
    process.exit(1);
  }
}

// Seal the app bundle last (with entitlements on the top-level executable).
console.log("[mac-sign] sealing the .app bundle…");
run("codesign", ["--force", "--timestamp", "--options", "runtime", "--entitlements", entitlements, "--sign", identity, appPath]);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
console.log("[mac-sign] codesign --verify passed.");

// ── 5. Build the DMG (app + /Applications drop target) ───────────────────────────────────────────────────────
const outDir = join(APP, "build", "mac");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const staging = join(outDir, ".dmg-staging");
mkdirSync(staging, { recursive: true });
run("cp", ["-R", appPath, join(staging, "Airwave.app")]);
symlinkSync("/Applications", join(staging, "Applications"));
const dmg = join(outDir, `Airwave-Server-${version}-macos-${arch}.dmg`);
run("hdiutil", ["create", "-volname", "Airwave", "-srcfolder", staging, "-ov", "-format", "ULFO", dmg]);
run("codesign", ["--force", "--timestamp", "--sign", identity, dmg]);
console.log(`[mac-sign] DMG built + signed: ${dmg}`);

// ── 6. Notarize + staple ─────────────────────────────────────────────────────────────────────────────────────
console.log("[mac-sign] submitting to notarytool (this waits for Apple)…");
const submit = run(
  "xcrun",
  ["notarytool", "submit", dmg, "--key", notaryKey, "--key-id", notaryKeyId, "--issuer", notaryIssuer, "--wait", "--output-format", "json"],
  { capture: true },
);
console.log(submit);
let status = "";
let submissionId = "";
try {
  const j = JSON.parse(submit) as { status?: string; id?: string };
  status = j.status ?? "";
  submissionId = j.id ?? "";
} catch {
  status = /status:\s*(\w+)/i.exec(submit)?.[1] ?? "";
}
if (status !== "Accepted") {
  console.error(`[mac-sign] notarization not Accepted (status: ${status || "unknown"}). Fetching log…`);
  if (submissionId) {
    try {
      console.error(run("xcrun", ["notarytool", "log", submissionId, "--key", notaryKey, "--key-id", notaryKeyId, "--issuer", notaryIssuer], { capture: true }));
    } catch {
      /* best-effort */
    }
  }
  process.exit(1);
}
run("xcrun", ["stapler", "staple", dmg]);
run("xcrun", ["stapler", "validate", dmg]);
console.log("[mac-sign] notarized + stapled.");

// ── 7. Publish to artifacts/ ─────────────────────────────────────────────────────────────────────────────────
const artifacts = join(APP, "artifacts");
mkdirSync(artifacts, { recursive: true });
run("cp", [dmg, join(artifacts, `Airwave-Server-${version}-macos-${arch}.dmg`)]);
rmSync(staging, { recursive: true, force: true });
console.log(`[mac-sign] ✅ done → artifacts/Airwave-Server-${version}-macos-${arch}.dmg`);
