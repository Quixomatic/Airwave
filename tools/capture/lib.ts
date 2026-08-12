import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import { AUTH, MEDIA, OUT, VIEWPORTS, type ViewportName } from "./config";

/**
 * Open a headless browser context, reusing the saved session (`.auth/state.json`) so authed pages render.
 * Pass `record: true` to capture a .webm video of the whole flow (converted to mp4/gif via ffmpeg helpers).
 */
export async function open(
  opts: { viewport?: ViewportName; record?: boolean; theme?: "dark" | "light" } = {},
) {
  const vp = VIEWPORTS[opts.viewport ?? "desktop"];
  if (!existsSync(AUTH)) {
    throw new Error(`No saved session at ${AUTH}. Run \`pnpm run signin\` first and sign in.`);
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    colorScheme: opts.theme, // emulate prefers-color-scheme for any "system" defaults
    storageState: AUTH,
    recordVideo: opts.record ? { dir: MEDIA, size: { width: vp.width, height: vp.height } } : undefined,
  });
  // Force the admin's next-themes choice before any page script runs (storageKey="vite-ui-theme").
  if (opts.theme) {
    await context.addInitScript((t) => {
      try {
        localStorage.setItem("vite-ui-theme", t as string);
      } catch {
        /* ignore */
      }
    }, opts.theme);
  }
  const page = await context.newPage();
  return { browser, context, page, done: () => browser.close() };
}

/**
 * Wait for a page to actually settle before shooting: network idle, fonts ready, any "Loading…" text gone,
 * then a fixed cushion for entrance animations. Pass `extra` ms for slow pages (e.g. the guide preview).
 */
export async function settle(page: Page, extra = 1200) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready).catch(() => {});
  await page.getByText(/loading/i).first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(extra);
}

/** Screenshot the current page into the staging dir as `<name>.png`. */
export async function shoot(page: Page, name: string, opts: { fullPage?: boolean } = {}) {
  mkdirSync(OUT, { recursive: true });
  const path = resolve(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: opts.fullPage ?? false, animations: "disabled" });
  console.log("📸", path);
  return path;
}

/** Locate a `Frame` (`data-slot="frame"`) by its title text (e.g. "Preview", "Schedule"). */
export function frame(page: Page, title: string): Locator {
  return page
    .locator('[data-slot="frame"]', {
      has: page.locator('[data-slot="frame-panel-title"]', { hasText: title }),
    })
    .first();
}

/**
 * Focused screenshot of a single element, with an optional buffer of the page's own background color
 * around it (via ffmpeg pad, so it works even when the element is taller than the viewport). Great for a
 * clean, self-contained shot of one component — a filter panel, a preview frame, a schedule frame.
 */
export async function shootEl(
  page: Page,
  locator: Locator,
  name: string,
  opts: { pad?: number } = {},
) {
  mkdirSync(OUT, { recursive: true });
  const pad = opts.pad ?? 0;
  const out = resolve(OUT, `${name}.png`);
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(250);
  if (!pad) {
    await locator.screenshot({ path: out, animations: "disabled" });
    console.log("📸", out);
    return out;
  }
  const raw = resolve(OUT, `.${name}.raw.png`);
  await locator.screenshot({ path: raw, animations: "disabled" });
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor).catch(() => "");
  const color = cssColorToHex(bg) ?? "#0a0a0a";
  execFileSync("ffmpeg", ["-y", "-i", raw, "-vf", `pad=iw+${2 * pad}:ih+${2 * pad}:${pad}:${pad}:color=${color}`, out], { stdio: "ignore" });
  rmSync(raw, { force: true });
  console.log("📸", out, `(pad ${pad}px, ${color})`);
  return out;
}

/** rgb()/rgba() → #rrggbb (ffmpeg pad color). Returns null for transparent/unknown so caller can default. */
function cssColorToHex(v: string): string | null {
  const m = v.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,/\s]+([\d.]+))?/i);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (a === 0) return null; // transparent → let caller pick a default
  const hex = (n: string) => Number(n).toString(16).padStart(2, "0");
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

/**
 * Smoothly scroll the page (via wheel events, so it works whichever element actually scrolls) — for
 * recorded videos that glide down a long page. Call inside a `record: true` context.
 */
export async function smoothScroll(page: Page, opts: { distance?: number; step?: number; delay?: number } = {}) {
  const distance = opts.distance ?? 1600;
  const step = opts.step ?? 40;
  const delay = opts.delay ?? 16;
  await page.mouse.move(page.viewportSize()!.width / 2, page.viewportSize()!.height / 2);
  for (let scrolled = 0; scrolled < distance; scrolled += step) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(delay);
  }
}

/** Close a recording context and return the saved .webm path (call after all actions). */
export async function finishVideo(context: BrowserContext, page: Page): Promise<string | null> {
  const video = page.video();
  await context.close();
  if (!video) return null;
  const p = await video.path();
  console.log("🎞️ ", p);
  return p;
}

/** webm → mp4 (h264, faststart) for the site's <Video> component. */
export function toMp4(webm: string, name: string): string {
  mkdirSync(OUT, { recursive: true });
  const out = resolve(OUT, `${name}.mp4`);
  execFileSync("ffmpeg", ["-y", "-i", webm, "-movflags", "+faststart", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "22", out], { stdio: "inherit" });
  console.log("🎬", out);
  return out;
}

/** webm → gif (palette-optimized, capped width for size). */
export function toGif(webm: string, name: string, width = 900, fps = 15): string {
  mkdirSync(OUT, { recursive: true });
  const out = resolve(OUT, `${name}.gif`);
  const vf = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
  execFileSync("ffmpeg", ["-y", "-i", webm, "-vf", vf, out], { stdio: "inherit" });
  console.log("🌀", out);
  return out;
}
