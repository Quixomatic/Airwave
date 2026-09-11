#!/usr/bin/env bun
/**
 * bump-version — set every Airwave version file in lockstep, safely.
 *
 *   pnpm version:bump <patch|minor|major|X.Y.Z> [--dry-run]
 *
 * Writes ONLY version files (never the changelog, never git). The `/version-bump` flow still owns the
 * CHANGELOG entry + commit + push — this just does the mechanical, error-prone file edits so nobody has to
 * hand-sed a dozen files (and so we can never again global-sed Cargo.lock and bump a dependency crate by
 * accident — see the phf incident, .plans/feedback-versioning).
 *
 * Every edit is TARGETED: a JSON `"version"` key, the roku manifest's three version lines, or the single
 * `airwave` package's `version` line in Cargo.toml / Cargo.lock (found via its `name = "airwave"` anchor,
 * never a blind find-replace). Refuses to run if the version files are out of sync (surfaces the mismatch
 * rather than silently normalizing). Three segments only — never a fourth.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DRY = process.argv.includes("--dry-run") || process.argv.includes("--check");
const ARG = process.argv.slice(2).find((a) => !a.startsWith("-"));

// ── ANSI (no dep) ────────────────────────────────────────────────────────────
const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
};
const die = (msg: string): never => {
  console.error(`\n${c.red("✖")} ${msg}\n`);
  process.exit(1);
};

// ── target discovery ─────────────────────────────────────────────────────────
type Kind = "jsonVersion" | "rokuManifest" | "cargoPackage" | "cargoLockPackage" | "tizenConfig";
type Target = { path: string; kind: Kind };

function appPackageJsons(): string[] {
  // Discover apps/* (don't hardcode — apps are added over time, per /version-bump). A shippable app is a
  // direct child of apps/ with a package.json.
  const appsDir = join(ROOT, "apps");
  const out: string[] = [];
  for (const name of readdirSync(appsDir)) {
    const pkg = join(appsDir, name, "package.json");
    try {
      if (statSync(pkg).isFile()) out.push(pkg);
    } catch {
      /* no package.json here */
    }
  }
  return out.sort();
}

const TARGETS: Target[] = [
  ...appPackageJsons().map((path): Target => ({ path, kind: "jsonVersion" })),
  { path: join(ROOT, "apps/tv-web/public/appinfo.json"), kind: "jsonVersion" }, // webOS manifest
  { path: join(ROOT, "apps/tv-web/public/config.xml"), kind: "tizenConfig" }, // Tizen (Samsung TV) manifest
  { path: join(ROOT, "apps/tv-native/app.json"), kind: "jsonVersion" }, // Expo
  { path: join(ROOT, "apps/tv-tauri/src-tauri/tauri.conf.json"), kind: "jsonVersion" },
  { path: join(ROOT, "apps/tv-tauri/src-tauri/Cargo.toml"), kind: "cargoPackage" },
  { path: join(ROOT, "apps/tv-tauri/src-tauri/Cargo.lock"), kind: "cargoLockPackage" },
  { path: join(ROOT, "apps/tv-roku/manifest"), kind: "rokuManifest" },
];

// ── per-kind read/write (all targeted; return [currentVersion, updatedText] ) ──
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** First `"version": "X.Y.Z"` value in a JSON file. */
function jsonRead(text: string): string | null {
  return text.match(/"version"\s*:\s*"(\d+\.\d+\.\d+)"/)?.[1] ?? null;
}
function jsonWrite(text: string, next: string): string {
  return text.replace(/("version"\s*:\s*")(\d+\.\d+\.\d+)(")/, `$1${next}$3`); // first occurrence only
}

/** Roku manifest: major_version / minor_version / build_version → "maj.min.build". */
// NB: no `$` anchors — files may be checked out CRLF, and a trailing \r would break `$`. Reads ignore the
// trailing \r; writes capture the key prefix and replace only the digits, leaving the line ending intact.
function rokuRead(text: string): string | null {
  const maj = text.match(/^major_version=(\d+)/m)?.[1];
  const min = text.match(/^minor_version=(\d+)/m)?.[1];
  const bld = text.match(/^build_version=(\d+)/m)?.[1];
  return maj && min && bld ? `${maj}.${min}.${bld}` : null;
}
function rokuWrite(text: string, next: string): string {
  const [maj, min, bld] = next.split(".");
  return text
    .replace(/^(major_version=)\d+/m, `$1${maj}`)
    .replace(/^(minor_version=)\d+/m, `$1${min}`)
    .replace(/^(build_version=)\d+/m, `$1${bld}`);
}

/**
 * The `airwave` package's `version` line in Cargo.toml / Cargo.lock — found via its `name = "airwave"`
 * anchor, so dependency crates (phf, if-addrs, reqwest, …) are NEVER touched. This is the whole reason the
 * script exists.
 */
function cargoRead(text: string): string | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'name = "airwave"') {
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const m = lines[j].replace(/\r$/, "").match(/^version = "(\d+\.\d+\.\d+)"$/);
        if (m) return m[1];
      }
    }
  }
  return null;
}
function cargoWrite(text: string, next: string): string {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === 'name = "airwave"') {
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        if (/^version = "\d+\.\d+\.\d+"$/.test(lines[j].replace(/\r$/, ""))) {
          const cr = lines[j].endsWith("\r") ? "\r" : ""; // preserve the line's ending (CRLF vs LF)
          lines[j] = `version = "${next}"${cr}`;
          return lines.join("\n");
        }
      }
    }
  }
  return text;
}

/**
 * Tizen config.xml: the widget's own `version="X.Y.Z"` attribute. `\bversion=` (not just `version=`) so the
 * two-segment `required_version="2.4"` is never touched — a word boundary can't sit inside `required_version`,
 * and it isn't three segments anyway.
 */
function tizenRead(text: string): string | null {
  return text.match(/\bversion="(\d+\.\d+\.\d+)"/)?.[1] ?? null;
}
function tizenWrite(text: string, next: string): string {
  return text.replace(/(\bversion=")(\d+\.\d+\.\d+)(")/, `$1${next}$3`); // first occurrence only
}

function readVersion(t: Target, text: string): string | null {
  switch (t.kind) {
    case "jsonVersion":
      return jsonRead(text);
    case "rokuManifest":
      return rokuRead(text);
    case "cargoPackage":
    case "cargoLockPackage":
      return cargoRead(text);
    case "tizenConfig":
      return tizenRead(text);
  }
}
function writeVersion(t: Target, text: string, next: string): string {
  switch (t.kind) {
    case "jsonVersion":
      return jsonWrite(text, next);
    case "rokuManifest":
      return rokuWrite(text, next);
    case "cargoPackage":
    case "cargoLockPackage":
      return cargoWrite(text, next);
    case "tizenConfig":
      return tizenWrite(text, next);
  }
}

const rel = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");

// ── load + validate current state ────────────────────────────────────────────
type Loaded = { t: Target; text: string; current: string };
const loaded: Loaded[] = [];
const missing: string[] = [];
for (const t of TARGETS) {
  let text: string;
  try {
    text = readFileSync(t.path, "utf8");
  } catch {
    missing.push(rel(t.path));
    continue;
  }
  const current = readVersion(t, text);
  if (!current) die(`Could not find a version in ${rel(t.path)} — the file format may have changed. Update scripts/bump-version.ts.`);
  loaded.push({ t, text, current });
}
if (missing.length) die(`Version file(s) not found:\n  ${missing.join("\n  ")}\nUpdate scripts/bump-version.ts if a file moved.`);

// Canonical = apps/server/package.json; everything must match it.
const canonical = loaded.find((l) => rel(l.t.path) === "apps/server/package.json") ?? loaded[0];
const current = canonical.current;
const mismatched = loaded.filter((l) => l.current !== current);
if (mismatched.length) {
  console.error(`\n${c.red("✖ Version files are OUT OF SYNC")} (canonical ${c.bold(current)} from ${rel(canonical.t.path)}):`);
  for (const l of mismatched) console.error(`  ${c.yellow(l.current.padEnd(10))} ${rel(l.t.path)}`);
  console.error(`\nResolve the mismatch by hand first (it may be intentional or a botched prior bump).\n`);
  process.exit(1);
}

// ── compute next version ─────────────────────────────────────────────────────
if (!ARG) die("Usage: pnpm version:bump <patch|minor|major|X.Y.Z> [--dry-run]");
const [maj, min, pat] = current.split(".").map(Number);
let next: string;
if (ARG === "patch") next = `${maj}.${min}.${pat + 1}`;
else if (ARG === "minor") next = `${maj}.${min + 1}.0`;
else if (ARG === "major") next = `${maj + 1}.0.0`;
else if (SEMVER.test(ARG)) next = ARG;
else die(`Invalid argument "${ARG}". Use patch | minor | major | X.Y.Z (three segments, never four).`);

if (next! === current) die(`New version equals current (${current}); nothing to do.`);

// ── apply ────────────────────────────────────────────────────────────────────
console.log(`\n${c.bold("Airwave version bump")}  ${c.dim(current)} ${c.dim("→")} ${c.cyan(c.bold(next!))}${DRY ? c.yellow("   (dry run — no files written)") : ""}\n`);
for (const l of loaded) {
  const updated = writeVersion(l.t, l.text, next!);
  if (updated === l.text) die(`No change applied to ${rel(l.t.path)} — targeted replace matched nothing. Aborting so the set stays consistent.`);
  if (!DRY) writeFileSync(l.t.path, updated);
  console.log(`  ${c.green("✓")} ${rel(l.t.path)}`);
}
console.log(
  `\n${c.green("Done.")} ${loaded.length} files ${DRY ? "would be" : ""} set to ${c.bold(next!)}.` +
    `\n${c.dim("Next: write the CHANGELOG entry, then commit + push (see /version-bump).")}\n`,
);
