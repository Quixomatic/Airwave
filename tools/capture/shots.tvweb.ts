import { open, settle, shoot } from "./lib";
import { URLS } from "./config";

/**
 * tv-web (10-foot player) captures at tv4k (1920×1080 @2 → 3840×2160, the real-TV look). The 10-foot app is
 * always dark by design, so no theme override. The saved session carries a stable device id + a matching
 * `cg-caps-done`, so the capability diagnostic does NOT re-run. Deeper flows (enter a channel, open the
 * bumper card) come next — drive them with `playwright codegen` and I'll script the beats.
 */
async function main() {
  const { page, done } = await open({ viewport: "tv4k" });
  await page.goto(URLS.tvweb, { waitUntil: "networkidle" }).catch(() => {});
  await settle(page, 3500);
  await shoot(page, "tvweb-guide");
  await done();
  console.log("\nDone. Review apps/site/public/screenshots/_captures/tvweb-guide.png.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
