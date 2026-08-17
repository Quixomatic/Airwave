// Generate the Roku icon-font assets from lucide-static + @phosphor-icons/web (fill weight).
// - Copies lucide.ttf + Phosphor-Fill.ttf into fonts/.
// - Emits images/icons-lucide.json / images/icons-phosphor.json: { PascalName: codepoint } maps keyed by
//   the SAME id the admin stores (`lucide:Sparkles` / `phosphor:Television`), so the client looks up
//   directly with no name munging. Icons render as a Label (text = Chr(codepoint), tinted via color).
//
// Run: node scripts/gen-icons.mjs   (from apps/tv-roku)
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const root = join(here, "..");

// kebab → PascalCase (matches lucide-react / @phosphor-icons/react export names).
const toPascal = (kebab) =>
  kebab.split("-").filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

// Resolve via node_modules directly ('exports' maps block deep require.resolve; fs follows pnpm symlinks).
const lucideDir = join(root, "node_modules/lucide-static");
const phosphorDir = join(root, "node_modules/@phosphor-icons/web");

mkdirSync(join(root, "fonts"), { recursive: true });
mkdirSync(join(root, "images"), { recursive: true });

// --- fonts ---
copyFileSync(join(lucideDir, "font/lucide.ttf"), join(root, "fonts/lucide.ttf"));
copyFileSync(join(phosphorDir, "src/fill/Phosphor-Fill.ttf"), join(root, "fonts/phosphor-fill.ttf"));

// --- lucide map (codepoints.json is kebab → decimal codepoint) ---
const lucideCp = JSON.parse(readFileSync(join(lucideDir, "font/codepoints.json"), "utf8"));
const lucideMap = {};
for (const [kebab, code] of Object.entries(lucideCp)) lucideMap[toPascal(kebab)] = code;
writeFileSync(join(root, "images/icons-lucide.json"), JSON.stringify(lucideMap));

// --- phosphor fill map (IcoMoon selection.json; names carry a `-fill` suffix) ---
const sel = JSON.parse(readFileSync(join(phosphorDir, "src/fill/selection.json"), "utf8"));
const phosphorMap = {};
for (const ic of sel.icons) {
  const base = ic.properties.name.replace(/-fill$/, "");
  phosphorMap[toPascal(base)] = ic.properties.code;
}
writeFileSync(join(root, "images/icons-phosphor.json"), JSON.stringify(phosphorMap));

console.log(`lucide: ${Object.keys(lucideMap).length} glyphs → fonts/lucide.ttf`);
console.log(`phosphor: ${Object.keys(phosphorMap).length} glyphs → fonts/phosphor-fill.ttf`);
console.log("wrote images/icons-lucide.json + images/icons-phosphor.json");
