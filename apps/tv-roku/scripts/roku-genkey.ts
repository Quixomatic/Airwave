/**
 * roku-genkey — generate this device's Roku SIGNING KEY (one time, ever) and save the password.
 *
 *   pnpm -F tv-roku genkey        (or: bun apps/tv-roku/scripts/roku-genkey.ts)
 *
 * A published Roku channel is signed with a key that lives ON one Roku box. This runs `genkey` on the
 * device's dev console (telnet port 8080), which generates that key and prints a **Password** + **DevID**.
 * It saves the Password as `signingPassword` (and `devId`) into rokudeploy.json (gitignored) so
 * `pnpm -F tv-roku package` can sign builds non-interactively.
 *
 * ⚠️⚠️ THIS PASSWORD IS UNRECOVERABLE AND PERMANENT. Once you publish a channel signed with this key,
 *   EVERY future update must be signed with the SAME key + password. If you lose it — or run `genkey`
 *   AGAIN (which generates a brand-new key and destroys this one) — you can never update the published
 *   channel again; you'd have to ship a whole new channel and make users re-install. So:
 *     1. BACK IT UP somewhere durable (a password manager) the moment it prints — do not rely only on
 *        rokudeploy.json, which is local + gitignored.
 *     2. This script REFUSES to run if rokudeploy.json already has a signingPassword (so you can't wipe
 *        your key by accident). Pass `--force` only if you truly intend to generate a NEW key (e.g. a
 *        fresh device that has never published), understanding it invalidates the old one.
 *
 * The Roku must be awake + in Developer Mode. Host comes from rokudeploy.json (or ROKU_HOST).
 */
import net from "node:net";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const CFG_PATH = join(APP, "rokudeploy.json");
const cfg = JSON.parse(readFileSync(CFG_PATH, "utf8"));
const HOST = process.env.ROKU_HOST || cfg.host;
const GENKEY_PORT = 8080; // the dev-key console (NOT 8085, which is the BrightScript debug console)
const FORCE = process.argv.includes("--force");

if (cfg.signingPassword && !FORCE) {
  console.error(
    `\n✗ rokudeploy.json ALREADY has a signingPassword (DevID ${cfg.devId ?? "?"}).\n` +
      `  Refusing to run — generating a new key would DESTROY the existing one and break updates to any\n` +
      `  channel already published with it. If you are 100% sure you want a brand-new key, re-run with --force.\n`,
  );
  process.exit(1);
}

/** Talk to the port-8080 dev console: connect, send `genkey`, collect output until Password + DevID appear. */
function genkey(): Promise<{ password: string; devId: string }> {
  return new Promise((resolve, reject) => {
    let buf = "";
    let sent = false;
    const sock = net.createConnection({ host: HOST, port: GENKEY_PORT });
    // Key generation is slow on-device (crypto) — give it plenty of room before giving up.
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error(`timed out after 120s (got: ${JSON.stringify(buf.slice(-200))})`));
    }, 120_000);

    const tryParse = () => {
      const pw = /Password:\s*(\S+)/i.exec(buf);
      const id = /DevID:\s*(\S+)/i.exec(buf);
      if (pw && id) {
        clearTimeout(timer);
        sock.destroy();
        resolve({ password: pw[1], devId: id[1] });
      }
    };

    sock.on("connect", () => {
      // A short beat, then issue the command. Some boxes print a banner first; sending after connect is fine.
      setTimeout(() => {
        sock.write("genkey\r\n");
        sent = true;
        process.stdout.write("  genkey requested — generating key on device (this can take up to a minute)… ");
      }, 400);
    });
    sock.on("data", (d) => {
      buf += d.toString();
      tryParse();
    });
    sock.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`can't reach ${HOST}:${GENKEY_PORT} — ${e.message}. Is the Roku awake + in Developer Mode?`));
    });
    sock.on("close", () => {
      clearTimeout(timer);
      // If it closed before we parsed, surface whatever we saw.
      if (!/Password:/i.test(buf)) {
        reject(new Error(sent ? `console closed without a key (got: ${JSON.stringify(buf.slice(-200))})` : "console closed before genkey was sent"));
      }
    });
  });
}

async function main() {
  console.log(`Roku ${HOST}: generating signing key…`);
  const { password, devId } = await genkey();
  console.log("ok\n");

  // Persist into rokudeploy.json, preserving field order + everything else.
  cfg.signingPassword = password;
  cfg.devId = devId;
  writeFileSync(CFG_PATH, JSON.stringify(cfg, null, 2) + "\n");

  console.log("━".repeat(72));
  console.log("  🔑  SIGNING KEY GENERATED — BACK THIS UP NOW (unrecoverable, permanent):");
  console.log(`        signingPassword : ${password}`);
  console.log(`        DevID           : ${devId}`);
  console.log("━".repeat(72));
  console.log("  Saved to rokudeploy.json (gitignored). ALSO copy it into a password manager — if you");
  console.log("  ever lose it you can never update a channel published with this key.");
  console.log("  Next: `pnpm -F tv-roku package` builds + signs a .pkg for the Developer Dashboard.\n");
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});
