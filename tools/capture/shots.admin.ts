import { open, settle, shoot } from "./lib";
import { URLS } from "./config";

/**
 * Admin captures — dark theme, 1920×1080, each route settled before the shot. Tweak the list / add per-shot
 * setup (open a dialog, hover a row) as we refine. Output goes to the `_captures` staging dir.
 */
const SHOTS: { path: string; name: string; extra?: number }[] = [
  { path: "/guide", name: "admin-guide", extra: 3500 }, // guide preview streams in — give it longer
  { path: "/channels", name: "admin-channels" },
  { path: "/packages", name: "admin-packages" },
  { path: "/sources", name: "admin-sources" },
  { path: "/bumpers", name: "admin-bumpers" },
  { path: "/users", name: "admin-users" },
  { path: "/settings/ai", name: "admin-settings-ai" },
];

async function main() {
  const { page, done } = await open({ viewport: "desktop", theme: "dark" });
  for (const s of SHOTS) {
    await page.goto(URLS.admin + s.path, { waitUntil: "networkidle" }).catch(() => {});
    await settle(page, s.extra ?? 1200);
    await shoot(page, s.name);
  }
  await done();
  console.log("\nDone. Review apps/site/public/screenshots/_captures/, then promote the keepers.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
