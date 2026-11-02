import { parseColor } from "./color";
import { AURORA, type GuideTokens } from "./guide-tokens";

/**
 * Whether a token set is one the renderers can draw: what "parses" means for a theme variant. `tokenProblems` returns one
 * line per fault (an empty list is a valid set), so a test can print what is wrong instead of just failing:
 *  - it has every field `AURORA` has, and nothing else (a field that is an object in Aurora has the same keys; the ones whose
 *    keys depend on a `mode` or `kind` are checked by their own rule);
 *  - every color parses as a color, every word is one the field accepts, every alpha is in 0..1 and every size is a
 *    finite number that is not negative (an offset and a letter spacing may be);
 *  - the fields that must agree with each other do: the weights the rows read are the type style's, a mode has the colors it
 *    needs, a text role names a face the theme has.
 *
 * Used by the guide's tests; no react-native imports, so bun can load it.
 */
const colorOk = (v: unknown): boolean => {
  if (typeof v !== "string") return false;
  try {
    parseColor(v);
    return true;
  } catch {
    return false;
  }
};
type Rule = (v: unknown) => boolean;
const oneOf =
  (...words: string[]): Rule =>
  (v) =>
    typeof v === "string" && words.includes(v);
const colorOr =
  (...words: string[]): Rule =>
  (v) =>
    oneOf(...words)(v) || colorOk(v);
const text: Rule = (v) => typeof v === "string" && v.length > 0;

const WEIGHTS = ["400", "500", "600", "700", "800", "900"];

/** The words a string field accepts, by path (`*` stands for an array index). Any other string must be a color. */
const WORDS: [RegExp, Rule][] = [
  [/^accentMode$/, oneOf("channel", "fixed", "cycle")],
  [/^railLayout$/, oneOf("aurora", "numeral")],
  [/^(titleWeight|numberWeight)$/, oneOf(...WEIGHTS)],
  [/^typeStyle\.\w+\.weight$/, oneOf(...WEIGHTS)],
  [/^typeStyle\.\w+\.font$/, oneOf("text", "display")],
  [/^typeStyle\.\w+\.case$/, oneOf("none", "upper")],
  [/^typeStyle\.(display|text)\.family$/, text],
  [/^liveFill\.mode$/, oneOf("tint", "neutral")],
  [/^circleStyle\.fill$/, colorOr("accent", "accent-solid", "none")],
  [/^circleStyle\.border$/, colorOr("accent")],
  [/^circleStyle\.glyph$/, colorOr("accent", "auto")],
  [/^progress\.style$/, oneOf("none", "bar", "band", "ticks")],
  [/^progress\.fill$/, colorOr("accent")],
  [/^progress\.trackBorder\.sides$/, oneOf("top")],
  [/^progress\.remainPattern\.kind$/, oneOf("halftone")],
  [/^statusLabel\.mode$/, oneOf("none", "plate", "burst", "kicker")],
  [/^statusLabel\.(text|live)$/, text],
  [/^art\.layout$/, oneOf("full", "side")],
  [/^patterns\.(bg|overlay)\.kind$/, oneOf("halftone", "grid", "grain")],
  [/^headerStyle\.markerShape$/, oneOf("triangle", "square")],
  [/^misregister\.blend$/, oneOf("multiply")],
  [/^misregister\.text\.\*$/, oneOf("number", "title", "featured", "header")],
  [/^misregister\.shapes\.\*$/, oneOf("circle", "ring")],
  [/^featuredName$/, colorOr("accent")],
  [/^halo\.\*\.color$/, colorOr("accent")],
];

/** Numbers that are an alpha or a fraction: 0..1. */
const FRACTIONS = [
  /^(railFocusAlpha|accentShade)$/,
  /^circle\.(fillA|borderA)$/,
  /^glass\.\w+A$/,
  /^featured\.numberA$/,
  /^liveFill\.(elapsed|remain)$/,
  /^halo\.\*\.a$/,
  /^(shadow|shadowFocus)\.steps\.\*\.a$/,
  /^patterns\.overlay\.(alpha|density)$/,
  /^art\.sideFrac$/,
  /^circleStyle\.radius$/,
];

/** Objects whose keys depend on their `mode`: not compared key for key with Aurora's. */
const OPEN_SHAPES = new Set(["liveFill", "statusLabel"]);

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function tokenProblems(tk: GuideTokens): string[] {
  const out: string[] = [];
  const bad = (path: string, what: string) => out.push(`${path}: ${what}`);

  // The same fields as Aurora, down through its plain objects.
  const sameKeys = (v: Record<string, unknown>, ref: Record<string, unknown>, path: string) => {
    const a = Object.keys(v).sort().join(",");
    const b = Object.keys(ref).sort().join(",");
    if (a !== b) bad(path || "(top level)", `has keys [${a}], Aurora has [${b}]`);
    for (const k of Object.keys(ref)) {
      const p = path ? `${path}.${k}` : k;
      if (OPEN_SHAPES.has(p) || !isPlain(ref[k]) || !isPlain(v[k])) continue;
      sameKeys(v[k] as Record<string, unknown>, ref[k] as Record<string, unknown>, p);
    }
  };
  sameKeys(tk as unknown as Record<string, unknown>, AURORA as unknown as Record<string, unknown>, "");

  // Leaves: colors, words, alphas and sizes.
  const walk = (v: unknown, path: string) => {
    if (typeof v === "string") {
      const rule = WORDS.find(([re]) => re.test(path));
      if (rule) {
        if (!rule[1](v)) bad(path, `${JSON.stringify(v)} is not accepted here`);
      } else if (!colorOk(v)) {
        bad(path, `${JSON.stringify(v)} is not a color`);
      }
    } else if (typeof v === "number") {
      if (!Number.isFinite(v)) bad(path, `${v} is not finite`);
      else if (FRACTIONS.some((re) => re.test(path))) {
        if (v < 0 || v > 1) bad(path, `${v} is not in 0..1`);
      } else if (/(^|\.)(dx|dy|track)$/.test(path)) {
        // an offset, or letter spacing in em: either sign
      } else if (v < 0) bad(path, `${v} is negative`);
    } else if (Array.isArray(v)) {
      v.forEach((x) => walk(x, `${path}.*`));
    } else if (isPlain(v)) {
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    } else if (v !== null && typeof v !== "boolean") {
      bad(path, `unexpected ${typeof v}`);
    }
  };
  walk(tk, "");

  // Fields that have to agree.
  if (tk.titleWeight !== tk.typeStyle.title.weight) bad("titleWeight", `${tk.titleWeight} is not the type style's ${tk.typeStyle.title.weight}`);
  if (tk.numberWeight !== tk.typeStyle.number.weight) bad("numberWeight", `${tk.numberWeight} is not the type style's ${tk.typeStyle.number.weight}`);
  for (const [role, s] of Object.entries(tk.typeStyle)) {
    if (s && typeof s === "object" && "font" in s && s.font === "display" && !tk.typeStyle.display) bad(`typeStyle.${role}`, "asks for a display face the theme does not have");
    if (s && typeof s === "object" && "scale" in s && !(s.scale > 0 && s.scale <= 3)) bad(`typeStyle.${role}.scale`, `${s.scale} is not in (0, 3]`);
  }
  if (!(tk.fontScale >= 1 && tk.fontScale <= 1.3)) bad("fontScale", `${tk.fontScale} is not in 1..1.3`);
  if (tk.accentMode === "fixed" && !tk.accentFixed) bad("accentFixed", "fixed mode has no color");
  if (tk.accentMode !== "fixed" && tk.accentFixed) bad("accentFixed", `a fixed color in ${tk.accentMode} mode`);
  if (tk.accentMode === "cycle" && !(tk.accentCycle && tk.accentCycle.length > 0)) bad("accentCycle", "cycle mode has no colors");
  if (tk.accentMode !== "cycle" && tk.accentCycle) bad("accentCycle", `colors in ${tk.accentMode} mode`);
  if (tk.progress.style === "ticks" && !tk.progress.ticks) bad("progress.ticks", "the ticks style has no ticks");
  if (tk.ringW <= 0) bad("ringW", `${tk.ringW} leaves the selected cell without an outline`);
  if (tk.ringW < tk.cellBorderW) bad("ringW", "is thinner than the cell border");
  if (tk.liveFill.mode === "tint" && (tk.liveFill.elapsed > 1 || tk.liveFill.remain > 1)) bad("liveFill", "alpha above 1");
  if (tk.art.layout === "side" && !(tk.art.sideFrac > 0 && tk.art.sideFrac < 1)) bad("art.sideFrac", "a side layout needs a fraction between 0 and 1");
  if (tk.art.placeholder.stops.length < 2) bad("art.placeholder", "a gradient needs two stops");
  for (const s of tk.art.placeholder.stops) if (!(s[1] >= 0 && s[1] <= 1)) bad("art.placeholder", `a stop at ${s[1]}`);
  const gr = tk.patterns.overlay;
  if (gr && gr.colors.length === 0) bad("patterns.overlay.colors", "grain needs a color");
  return out;
}
