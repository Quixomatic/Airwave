/**
 * grab-screenshot — capture a screenshot from the Roku dev console, on demand.
 *
 *   pnpm -F tv-roku grab-screenshot [name]     (or: bun apps/tv-roku/scripts/grab-screenshot.ts [name])
 *
 * Navigate the app on the Roku to the screen you want, then run this. It asks the dev console to grab the
 * CURRENT screen and saves it to apps/tv-roku/screenshots/<name>-<timestamp>.jpg (gitignored). Run it again
 * for each screen (guide / player / settings / …). `name` is an optional label for the file.
 *
 * Host + password come from rokudeploy.json; override with ROKU_HOST / ROKU_PASS env vars (e.g. the .252 TV).
 * Uses `curl --digest` (the dev console needs HTTP digest auth) via a subprocess — works under bun or node.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(APP, "rokudeploy.json"), "utf8"));
const HOST = process.env.ROKU_HOST || cfg.host;
const USER = process.env.ROKU_USER || "rokudev";
const PASS = process.env.ROKU_PASS || cfg.password;
const OUT = join(APP, "screenshots");

const name = (process.argv[2] || "shot").replace(/[^a-z0-9_-]/gi, "-");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = join(OUT, `${name}-${stamp}.jpg`);

/** Run curl with digest auth; returns stdout (trimmed) + throws-free exit handling. */
function curl(args: string[]): string {
  try {
    return execFileSync("curl", ["-sS", "--digest", "-u", `${USER}:${PASS}`, "-m", "15", ...args], {
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString()
      .trim();
  } catch (e: any) {
    return (e.stdout?.toString() ?? "").trim();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  // An empty "archive" form part the /plugin_inspect endpoint expects alongside mysubmit=Screenshot.
  const emptyArchive = join(tmpdir(), "roku-empty-archive.zip");
  writeFileSync(emptyArchive, "");

  process.stdout.write(`Roku ${HOST}: capturing… `);
  // 1) Ask the dev console to grab the current screen.
  const trig = curl([
    "-o", "/dev/null", "-w", "%{http_code}",
    "-F", "mysubmit=Screenshot", "-F", "passwd=", "-F", `archive=@${emptyArchive}`,
    `http://${HOST}/plugin_inspect`,
  ]);
  if (trig === "000" || trig === "") {
    console.error(`\n✗ can't reach ${HOST} — the Roku is asleep/off, or it isn't in Developer Mode. Wake it and retry.`);
    process.exit(1);
  }

  // 2) The device writes the JPEG a beat later; fetch it.
  await new Promise((r) => setTimeout(r, 900));
  const code = curl(["-o", file, "-w", "%{http_code}", `http://${HOST}/pkgs/dev.jpg`]);

  let size = 0;
  try { size = statSync(file).size; } catch {}
  if (code !== "200" || size < 1024) {
    console.error(`\n✗ no screenshot returned (HTTP ${code}, ${size} bytes). Is a channel running on the device?`);
    process.exit(1);
  }
  console.log(`ok\n  → ${file}  (${(size / 1024).toFixed(0)} KB)`);
}

main();
