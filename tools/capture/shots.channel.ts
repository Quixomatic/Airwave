import { open, settle, shootEl, frame } from "./lib";
import { URLS } from "./config";

/**
 * Focused, padded component shots from a channel's detail page — its filter, its Preview frame, and its
 * Schedule frame — each targeted by a stable selector (Frame `data-slot` + title / the "Content & filter"
 * section). Opens the first channel in the list. Dark, 1920×1080.
 */
async function main() {
  const { page, done } = await open({ viewport: "desktop", theme: "dark" });

  // Find the first real channel detail link (/channels/<id>, not /channels/new).
  await page.goto(URLS.admin + "/channels", { waitUntil: "networkidle" }).catch(() => {});
  await settle(page);
  const hrefs = await page
    .locator('a[href^="/channels/"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  const target = hrefs.find((h) => h && /^\/channels\/[^/]+$/.test(h) && h !== "/channels/new");
  if (!target) throw new Error("Couldn't find a channel to open — is the list populated?");
  console.log("→ channel:", target);

  await page.goto(URLS.admin + target, { waitUntil: "networkidle" }).catch(() => {});
  await settle(page, 5000); // the Preview resolves the whole filter against Plex — give it time

  // The "Content & filter" section (open by default) — target its collapsible root via the trigger's parent.
  const filterSection = page.getByRole("button", { name: /Content & filter/i }).locator("xpath=..");
  await shootEl(page, filterSection, "admin-channel-filter", { pad: 24 });
  await shootEl(page, frame(page, "Preview"), "admin-channel-preview", { pad: 24 });
  await shootEl(page, frame(page, "Schedule"), "admin-channel-schedule", { pad: 24 });

  await done();
  console.log("\nDone. Review the three admin-channel-* shots in _captures/.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
