import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import readline from "node:readline";
import { chromium } from "playwright";
import { AUTH, URLS } from "./config";

/**
 * Headed login — YOU run this once. It opens two tabs (admin + tv-web); sign in to each (Plex OAuth,
 * device code, whatever), then press ENTER here to save the session (cookies + localStorage) to
 * `.auth/state.json`. Every capture script reuses that, so I can shoot authed pages headlessly.
 * Re-run whenever the session expires.
 */
async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const admin = await context.newPage();
  await admin.goto(URLS.admin).catch(() => {});
  const tv = await context.newPage();
  await tv.goto(URLS.tvweb).catch(() => {});

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(" Sign in on BOTH tabs in the opened browser window:");
  console.log("   • Admin UI :", URLS.admin);
  console.log("   • tv-web   :", URLS.tvweb, "(device-code / Plex sign-in)");
  console.log(" Leave the browser open, come back here, and press ENTER to save.");
  console.log("────────────────────────────────────────────────────────────\n");

  await waitForEnter();
  mkdirSync(dirname(AUTH), { recursive: true });
  await context.storageState({ path: AUTH });
  console.log("\n✅ session saved →", AUTH, "\n");
  await browser.close();
}

function waitForEnter(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question("Press ENTER once signed in… ", () => { rl.close(); res(); }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
