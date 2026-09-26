/**
 * Convert image(s) to tiny, high-quality WebP for the site (blog/docs screenshots, generated feature images).
 * A thin, reusable wrapper over ffmpeg's libwebp encoder with the quality defaults we use on getairwave.tv,
 * so we stop hand-typing ffmpeg flags. Pairs with gen-blog-image.py (which generates the branded feature PNG;
 * run this on its output to ship a webp).
 *
 * Needs ffmpeg on PATH.
 *
 * Usage:
 *   # one file -> same name, .webp, next to it
 *   node apps/site/scripts/to-webp.mjs .docs/screenshots/preset-channel-revamp.png
 *
 *   # explicit output
 *   node apps/site/scripts/to-webp.mjs in.png --out apps/site/public/blog/preset-channel-revamp.webp
 *
 *   # many files into a directory
 *   node apps/site/scripts/to-webp.mjs a.png b.png --out-dir apps/site/public/blog
 *
 * Options:
 *   --out <path>        Output file (only with a single input).
 *   --out-dir <dir>     Output directory (basename kept, extension -> .webp).
 *   --quality <0-100>   libwebp quality (default 82).
 *   --preset <name>     libwebp preset: text | picture | photo | drawing | icon | default
 *                       (default "text" — keeps UI screenshots crisp; use "picture" for photos).
 *   --max-width <px>    Downscale to at most this width (aspect kept; never upscales).
 *   --lossless          Lossless encode (bigger; for flat UI where you want zero artifacts).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

function parseArgs(argv) {
  const opts = { inputs: [], quality: 82, preset: "text", maxWidth: null, out: null, outDir: null, lossless: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") opts.out = argv[++i];
    else if (a === "--out-dir") opts.outDir = argv[++i];
    else if (a === "--quality") opts.quality = Number(argv[++i]);
    else if (a === "--preset") opts.preset = argv[++i];
    else if (a === "--max-width") opts.maxWidth = Number(argv[++i]);
    else if (a === "--lossless") opts.lossless = true;
    else if (a.startsWith("--")) throw new Error(`Unknown option: ${a}`);
    else opts.inputs.push(a);
  }
  return opts;
}

function hasFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function outputFor(input, opts) {
  if (opts.out) return opts.out;
  const name = basename(input, extname(input)) + ".webp";
  return join(opts.outDir ?? dirname(input), name);
}

function convert(input, opts) {
  const output = outputFor(input, opts);
  mkdirSync(dirname(resolve(output)), { recursive: true });
  const args = ["-y", "-loglevel", "error", "-i", input];
  if (opts.maxWidth) args.push("-vf", `scale='min(iw,${opts.maxWidth})':-2:flags=lanczos`);
  args.push("-c:v", "libwebp", "-preset", opts.preset);
  if (opts.lossless) args.push("-lossless", "1");
  else args.push("-quality", String(opts.quality));
  args.push(output);
  execFileSync("ffmpeg", args, { stdio: ["ignore", "ignore", "inherit"] });

  const before = statSync(input).size;
  const after = statSync(output).size;
  const pct = before ? Math.round((1 - after / before) * 100) : 0;
  const kb = (n) => `${(n / 1024).toFixed(1)}kB`;
  console.log(`  ${input} -> ${output}  (${kb(before)} -> ${kb(after)}, -${pct}%)`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.inputs.length === 0) {
    console.error("Usage: node apps/site/scripts/to-webp.mjs <input...> [--out f | --out-dir d] [--quality N] [--preset p] [--max-width px] [--lossless]");
    process.exit(1);
  }
  if (opts.out && opts.inputs.length > 1) {
    console.error("--out takes a single input; use --out-dir for multiple.");
    process.exit(1);
  }
  if (!hasFfmpeg()) {
    console.error("ffmpeg not found on PATH. Install ffmpeg and try again.");
    process.exit(1);
  }
  for (const input of opts.inputs) {
    if (!existsSync(input)) {
      console.error(`  skip (missing): ${input}`);
      continue;
    }
    convert(input, opts);
  }
  console.log("done");
}

main();
